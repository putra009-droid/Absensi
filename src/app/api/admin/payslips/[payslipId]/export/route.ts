// src/app/api/admin/payslips/export/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

interface RouteContext {
  params: { payrollRunId: string }; // Menyesuaikan dengan payroll run ID
}

// Format rupiah
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

// Baca stream ke buffer
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Handler export PDF Daftar Gaji
const exportPayslipListPdfHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
  const adminUserId = request.user?.id;
  const payrollRunId = context?.params?.payrollRunId;

  if (!payrollRunId) {
    return NextResponse.json({ message: 'ID Payroll Run diperlukan.' }, { status: 400 });
  }

  console.log(`[API PDF Export] Request for Payroll Run ID: ${payrollRunId} by Admin: ${adminUserId}`);

  try {
    // Ambil semua payslip dalam payroll run tersebut
    const payrollRun = await prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        payslips: {
          include: {
            user: { select: { name: true, email: true } },
            payrollRun: { select: { periodStart: true, periodEnd: true } },
          }
        }
      }
    });

    if (!payrollRun || !payrollRun.payslips || payrollRun.payslips.length === 0) {
      return NextResponse.json({ message: `Tidak ada payslip ditemukan untuk Payroll Run ID '${payrollRunId}'.` }, { status: 404 });
    }

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

    doc.font(fontPathBold).fontSize(18).text('DAFTAR GAJI KARYAWAN', { align: 'center' });
    doc.moveDown(1);

    doc.font(fontPathRegular).fontSize(10).text(
      `Periode: ${payrollRun.periodStart.toLocaleDateString('id-ID')} - ${payrollRun.periodEnd.toLocaleDateString('id-ID')}`,
      { align: 'center' }
    );
    doc.moveDown(1);

    // Tabel Header
    doc.font(fontPathBold).fontSize(12).text('Nama Karyawan', { continued: true, width: 200 });
    doc.text('Gaji Pokok', { align: 'right' });
    doc.moveDown(0.5);

    // Garis pemisah
    doc.lineCap('butt').moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.5);

    // Isi Tabel
    payrollRun.payslips.forEach((payslip) => {
      doc.font(fontPathRegular).fontSize(10);
      doc.text(payslip.user.name ?? '-', { continued: true, width: 200 });
      doc.text(formatCurrencyPdf(payslip.baseSalary), { align: 'right' });
      doc.moveDown(0.4);
    });

    doc.end(); // Finalisasi PDF

    const buffer = await bufferPromise;

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    const fileName = `daftar-gaji-${payrollRun.periodStart.toISOString().split('T')[0]}-${payrollRun.periodEnd.toISOString().split('T')[0]}.pdf`;
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);

    console.log(`[API PDF Export] PDF generated successfully. Filename: ${fileName}`);
    return new NextResponse(buffer, { status: 200, headers });

  } catch (error: unknown) {
    console.error(`[API PDF Export] Error for Payroll Run ID ${payrollRunId ?? 'unknown'}:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ message: `Payroll Run ID '${payrollRunId}' tidak ditemukan.` }, { status: 404 });
      }
      if (error.code === 'P2023') {
        return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ message: 'Gagal men-generate PDF daftar gaji.' }, { status: 500 });
  }
};

// Export GET method
export const GET = withAuth(exportPayslipListPdfHandler, Role.SUPER_ADMIN);
