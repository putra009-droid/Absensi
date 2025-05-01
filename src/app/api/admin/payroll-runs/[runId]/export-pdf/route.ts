// src/app/api/admin/payroll-runs/[runId]/export-pdf/route.ts
// Version with fixes for pdf-lib drawText arguments

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
// Import middleware dan tipe yang sudah diperbaiki
import { withAuth, AuthenticatedRequest, RouteContext } from '@/lib/authMiddleware'; // Sesuaikan path
// Import jsonwebtoken untuk error check
import jwt from 'jsonwebtoken';
// Import pdf-lib dan date-fns (pastikan sudah diinstal)
import { PDFDocument, StandardFonts, rgb, PDFFont, PageSizes } from 'pdf-lib'; // Tambahkan PageSizes jika perlu
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// Helper function untuk format Rupiah
function formatCurrency(value: number | Prisma.Decimal | null | undefined): string {
    if (value === null || value === undefined) return 'Rp 0,00';
    const numberValue = typeof value === 'number' ? value : Number(value);
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(numberValue);
}

// Handler GET untuk Export PDF
const exportPayrollRunPdfHandler = async (request: AuthenticatedRequest, context: RouteContext<{ runId: string }>) => {
    const adminUserId = request.user?.id;
    const runId = context.params.runId;

    console.log(`[API GET /export-pdf] Request for Run ID: ${runId} by Admin: ${adminUserId}`);

    try {
        // 1. Ambil data Payroll Run
        const payrollRun = await prisma.payrollRun.findUnique({
            where: { id: runId },
            include: {
                executedBy: { select: { name: true } },
                payslips: {
                    include: {
                        user: { select: { id: true, name: true, email: true } },
                    },
                    orderBy: { user: { name: 'asc' } }
                }
            }
        });

        if (!payrollRun) {
            return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan.` }, { status: 404 });
        }
        if (!payrollRun.payslips || payrollRun.payslips.length === 0) {
            return NextResponse.json({ message: `Tidak ada data slip gaji (payslip) ditemukan untuk Payroll Run ID '${runId}'.` }, { status: 404 });
        }

        // 2. Buat Dokumen PDF
        const pdfDoc = await PDFDocument.create();
        let page = pdfDoc.addPage(PageSizes.A4); // Gunakan ukuran A4
        const { width, height } = page.getSize();

        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // --- Menulis ke PDF ---
        let yPosition = height - 50;
        const leftMargin = 50;
        const rightMargin = width - 50; // Batas kanan
        const lineSpacing = 18;
        const titleFontSize = 16;
        const headerFontSize = 10; // Perkecil sedikit untuk tabel
        const normalFontSize = 9;  // Perkecil sedikit untuk tabel

        // Fungsi helper drawText (sudah benar, hanya memastikan pemanggilannya benar)
        const drawText = (text: string, x: number, y: number, font: PDFFont, size: number): number => {
            page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
            // Kembalikan posisi Y berikutnya. Sesuaikan multiplier jika perlu spasi lebih/kurang.
            return y - (size * 1.3);
        };

        // Judul
        yPosition = drawText('Daftar Ringkasan Gaji Karyawan', leftMargin, yPosition, helveticaBoldFont, titleFontSize);
        yPosition -= lineSpacing / 2;

        // Info Periode
        const periode = `Periode: ${format(payrollRun.periodStart, 'dd MMMM yyyy', { locale: localeId })} - ${format(payrollRun.periodEnd, 'dd MMMM yyyy', { locale: localeId })}`;
        yPosition = drawText(periode, leftMargin, yPosition, helveticaFont, normalFontSize + 1); // Sedikit lebih besar
        const executionDate = `Tanggal Eksekusi: ${format(payrollRun.executionDate, 'dd MMMM yyyy HH:mm', { locale: localeId })}`;
        yPosition = drawText(executionDate, leftMargin, yPosition, helveticaFont, normalFontSize);
        const executedBy = `Dieksekusi Oleh: ${payrollRun.executedBy?.name || 'N/A'}`;
        yPosition = drawText(executedBy, leftMargin, yPosition, helveticaFont, normalFontSize);
        const status = `Status: ${payrollRun.status}`;
        yPosition = drawText(status, leftMargin, yPosition, helveticaFont, normalFontSize);
        yPosition -= lineSpacing;

        // Header Tabel
        const tableStartY = yPosition;
        // Sesuaikan posisi X kolom agar lebih pas di A4
        const col1X = leftMargin;                 // Nama
        const col2X = leftMargin + 180;           // Gaji Pokok
        const col3X = leftMargin + 300;           // Tunjangan
        const col4X = leftMargin + 420;           // Gaji Bersih (align right?)

        // === FIX: Panggil drawText dengan 2 argumen (text, options) ===
        drawText('Nama Karyawan', col1X, tableStartY, helveticaBoldFont, headerFontSize);
        drawText('Gaji Pokok', col2X, tableStartY, helveticaBoldFont, headerFontSize);
        drawText('Total Tunjangan', col3X, tableStartY, helveticaBoldFont, headerFontSize);
        drawText('Gaji Bersih (Net Pay)', col4X, tableStartY, helveticaBoldFont, headerFontSize);
        yPosition -= (headerFontSize * 1.3) + 2; // Turun setelah header

        // Garis bawah header
        page.drawLine({
            start: { x: leftMargin, y: yPosition + 5 },
            end: { x: rightMargin, y: yPosition + 5 }, // Gunakan rightMargin
            thickness: 0.5,
            color: rgb(0.5, 0.5, 0.5), // Warna abu-abu
        });
        yPosition -= 5;

        // Data Tabel
        for (const payslip of payrollRun.payslips) {
             if (yPosition < 60) { // Batas bawah halaman
                 page = pdfDoc.addPage(PageSizes.A4);
                 yPosition = height - 50;
                 // Gambar ulang header di halaman baru
                 drawText('Nama Karyawan', col1X, yPosition, helveticaBoldFont, headerFontSize);
                 drawText('Gaji Pokok', col2X, yPosition, helveticaBoldFont, headerFontSize);
                 drawText('Total Tunjangan', col3X, yPosition, helveticaBoldFont, headerFontSize);
                 drawText('Gaji Bersih (Net Pay)', col4X, yPosition, helveticaBoldFont, headerFontSize);
                 yPosition -= (headerFontSize * 1.3) + 2;
                 page.drawLine({ start: { x: leftMargin, y: yPosition + 5 }, end: { x: rightMargin, y: yPosition + 5 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
                 yPosition -= 5;
             }

            const currentLineY = yPosition;
            // === FIX: Panggil drawText dengan 2 argumen (text, options) ===
            drawText(payslip.user?.name || 'N/A', col1X, currentLineY, helveticaFont, normalFontSize);
            drawText(formatCurrency(payslip.baseSalary), col2X, currentLineY, helveticaFont, normalFontSize);
            drawText(formatCurrency(payslip.totalAllowance), col3X, currentLineY, helveticaFont, normalFontSize);
            drawText(formatCurrency(payslip.netPay), col4X, currentLineY, helveticaFont, normalFontSize);
            // Turunkan Y untuk baris berikutnya
            yPosition -= (normalFontSize * 1.3);
        }

        // --- Akhir Menulis ---

        // 3. Serialize PDF
        const pdfBytes = await pdfDoc.save();

        // 4. Nama File
        const filename = `Daftar_Gaji_${payrollRun.periodStart.toISOString().split('T')[0]}_${payrollRun.periodEnd.toISOString().split('T')[0]}.pdf`;

        // 5. Respons PDF
        return new NextResponse(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });

    } catch (error: unknown) {
        console.error(`[API GET /export-pdf] Error for Run ID ${runId}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2023' || error.message.includes('Malformed ObjectID')) {
                return NextResponse.json({ message: 'Format Payroll Run ID tidak valid.' }, { status: 400 });
            }
            return NextResponse.json({ message: 'Database error saat mengambil data payroll.', errorCode: error.code }, { status: 500 });
        }
         if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof jwt.NotBeforeError) {
           return NextResponse.json({ message: `Akses Ditolak: ${error.message}` }, { status: 401 });
         }
        const errorMessage = error instanceof Error ? error.message : 'Unknown server error.';
        return NextResponse.json({ message: `Gagal membuat file PDF: ${errorMessage}` }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth
export const GET = withAuth(exportPayrollRunPdfHandler, Role.SUPER_ADMIN); // Sesuaikan Role jika perlu
