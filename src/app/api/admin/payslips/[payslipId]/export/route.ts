// src/app/api/admin/payslips/[payslipId]/export/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// PERBAIKAN: Impor Prisma saja, tidak perlu PrismaClientKnownRequestError
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import PDFDocument from 'pdfkit'; // Asumsi library ini dan tipenya sudah terinstall
import path from 'path';
import fs from 'fs';

// Interface RouteContext tidak lagi diperlukan ATAU perlu diperbaiki jika dipakai
// interface RouteContext {
//  params: { payslipId: string }; // Seharusnya payslipId
// }

// Format rupiah (asumsi fungsi ini benar)
const formatCurrencyPdf = (value: Prisma.Decimal | number | null | undefined): string => {
    if (value === null || value === undefined) return 'Rp 0';
    try {
        const numValue = typeof value === 'number' ? value : parseFloat(value.toString());
        if (isNaN(numValue)) return 'Rp 0';
        return `Rp ${numValue.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    } catch (e) {
        return 'Rp -';
    }
};

// Baca stream ke buffer (asumsi fungsi ini benar)
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Handler export PDF untuk SATU Payslip (Nama fungsi mungkin perlu disesuaikan)
// PERBAIKAN SIGNATURE CONTEXT
const exportSinglePayslipPdfHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional, gunakan nama param yg benar '[payslipId]'
    context?: { params?: { payslipId?: string | string[] } }
) => {
    const adminUserId = request.user?.id; // Atau user biasa jika ini untuk /me/payslips/[id]/export ? Sesuaikan Role di export.

    // Validasi internal untuk payslipId
    const payslipIdParam = context?.params?.payslipId;
    if (typeof payslipIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Payslip tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const payslipId = payslipIdParam; // Aman digunakan

    console.log(`[API PDF Export Single] Request for Payslip ID: ${payslipId} by User: ${adminUserId}`);

    try {
        // Ambil data SATU payslip berdasarkan ID
        const payslip = await prisma.payslip.findUnique({
            where: { id: payslipId },
            include: {
                user: { select: { name: true, email: true } },
                payrollRun: { select: { periodStart: true, periodEnd: true, executionDate: true } },
                items: { orderBy: [{ type: 'asc' }, { description: 'asc' }] } // Ambil items juga
            }
        });

        if (!payslip) {
            return NextResponse.json({ message: `Payslip dengan ID '${payslipId}' tidak ditemukan.` }, { status: 404 });
        }

        // (Pastikan user yang request berhak melihat payslip ini jika bukan admin - logika belum ada)

        const fontDir = path.join(process.cwd(), 'src/assets/fonts');
        const fontPathRegular = path.join(fontDir, 'Roboto-Regular.ttf');
        const fontPathBold = path.join(fontDir, 'Roboto-Bold.ttf');

        if (!fs.existsSync(fontPathRegular) || !fs.existsSync(fontPathBold)) {
            console.error(`Font file not found! Path: ${fontDir}`);
            return NextResponse.json({ message: 'Kesalahan server: File font tidak ditemukan.' }, { status: 500 });
        }

        // === Mulai membuat PDF ===
        const doc = new PDFDocument({ size: 'A4', margin: 50, font: fontPathRegular });
        const bufferPromise = streamToBuffer(doc);

        // --- LOGIKA PEMBUATAN PDF UNTUK SATU SLIP GAJI ---
        // (Ini perlu Anda sesuaikan dengan format slip gaji yang diinginkan)
        // Contoh sederhana:
        doc.font(fontPathBold).fontSize(16).text('SLIP GAJI KARYAWAN', { align: 'center' });
        doc.moveDown(1);

        doc.font(fontPathRegular).fontSize(10);
        doc.text(`Nama Karyawan: ${payslip.user.name ?? '-'}`);
        doc.text(`Email: ${payslip.user.email}`);
        doc.text(`Periode: ${payslip.payrollRun.periodStart.toLocaleDateString('id-ID')} - ${payslip.payrollRun.periodEnd.toLocaleDateString('id-ID')}`);
        doc.text(`Tanggal Pembayaran: ${payslip.payrollRun.executionDate.toLocaleDateString('id-ID')}`);
        doc.moveDown(1);

        doc.font(fontPathBold).text('RINCIAN PENGHASILAN');
        doc.font(fontPathRegular);
        doc.text(` Gaji Pokok: ${formatCurrencyPdf(payslip.baseSalary)}`, { align: 'left' });
        // Tampilkan semua item tunjangan
        payslip.items.filter(item => item.type === 'ALLOWANCE').forEach(item => {
             doc.text(` ${item.description}: ${formatCurrencyPdf(item.amount)}`, { align: 'left' });
        });
         doc.font(fontPathBold).text(`TOTAL PENGHASILAN KOTOR: ${formatCurrencyPdf(payslip.grossPay)}`, { align: 'left' });
        doc.moveDown(1);


        doc.font(fontPathBold).text('RINCIAN POTONGAN');
         doc.font(fontPathRegular);
        // Tampilkan semua item potongan
        payslip.items.filter(item => item.type === 'DEDUCTION').forEach(item => {
             doc.text(` ${item.description}: ${formatCurrencyPdf(item.amount)}`, { align: 'left' });
        });
         doc.font(fontPathBold).text(`TOTAL POTONGAN: ${formatCurrencyPdf(payslip.totalDeduction)}`, { align: 'left' });
         doc.moveDown(1);


         doc.font(fontPathBold).fontSize(12).text(`PENGHASILAN BERSIH (NET PAY): ${formatCurrencyPdf(payslip.netPay)}`, { align: 'left'});
        // --- Akhir Contoh Logika PDF ---


        doc.end(); // Finalisasi PDF
        const buffer = await bufferPromise;

        const headers = new Headers();
        headers.set('Content-Type', 'application/pdf');
        // Nama file lebih spesifik untuk satu user
        const safeUserName = (payslip.user.name ?? 'user').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const safePeriod = payslip.payrollRun.periodStart.toISOString().split('T')[0];
        const fileName = `slip-gaji-${safeUserName}-${safePeriod}.pdf`;
        headers.set('Content-Disposition', `attachment; filename="${fileName}"`);

        console.log(`[API PDF Export Single] PDF generated successfully for Payslip ID: ${payslipId}. Filename: ${fileName}`);
        return new NextResponse(buffer, { status: 200, headers });

    // PERBAIKAN BLOK CATCH
    } catch (error: unknown) {
        console.error(`[API PDF Export Single] Error for Payslip ID ${payslipId ?? 'unknown'}:`, error);

        let errorMessage = 'Gagal men-generate PDF slip gaji.'; // Default
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            if (error.code === 'P2025') {
                return NextResponse.json({ message: `Payslip ID '${payslipId}' tidak ditemukan.` }, { status: 404 });
            }
            if (error.code === 'P2023') {
                return NextResponse.json({ message: 'Format ID Payslip tidak valid.' }, { status: 400 });
            }
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
             if (error.message.includes('Font file not found')) {
                 return NextResponse.json({ message: 'Kesalahan server: File font tidak dapat dimuat.' }, { status: 500 });
             }
        }

        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Export GET method
// Pastikan nama handler yang diexport benar, dan sesuaikan Role jika perlu
export const GET = withAuth(exportSinglePayslipPdfHandler, Role.SUPER_ADMIN); // Ganti nama handler jika perlu