// app/api/admin/payroll-runs/[runId]/export-pdf/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, User } from '@prisma/client'; // Import User
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

// Interface untuk context
interface RouteContext {
  params: { runId: string };
}

// Interface untuk data payslip yang diambil (termasuk user)
// Ini diperlukan untuk membuat Map nanti
interface PayslipWithUser extends Prisma.PayslipGetPayload<{
    include: { user: { select: { name: true, email: true, baseSalary: true } } }
}> {}


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

// Fungsi helper untuk menggambar header tabel
const drawTableHeader = (
  doc: PDFKit.PDFDocument,
  y: number,
  colWidths: number[],
  rowHeight: number,
  startX: number,
  fontPathBold: string
) => {
   doc.font(fontPathBold).fontSize(9);
   let currentX = startX;
   // Sesuaikan header jika perlu
   const headers = ['No.', 'Nama Karyawan', 'Gaji Pokok', 'Tunjangan', 'Potongan', 'Gaji Bersih'];

   headers.forEach((header, i) => {
      let align: PDFKit.Mixins.TextOptions['align'] = 'center';
      if (i === 1) align = 'left';
      else if (i > 1) align = 'right';

      doc.fillColor('black').text(header, currentX + 2 , y + 5, {
          width: colWidths[i] - 4,
          align: align
      });
      if (i < headers.length) {
           doc.moveTo(currentX + colWidths[i], y).lineTo(currentX + colWidths[i], y + rowHeight).lineWidth(0.5).strokeColor('#aaaaaa').stroke();
      }
      currentX += colWidths[i];
   });
    doc.moveTo(startX, y + rowHeight).lineTo(currentX, y + rowHeight).lineWidth(0.5).strokeColor('#aaaaaa').stroke();
};

// Fungsi helper untuk menggambar baris tabel
const drawTableRow = (
    doc: PDFKit.PDFDocument,
    y: number,
    itemNumber: string,
    name: string,
    baseSalary: string,
    allowance: string,
    deduction: string,
    netPay: string,
    colWidths: number[],
    rowHeight: number,
    startX: number,
    fontPathRegular: string,
    fontPathBold: string,
    isIncludedInRun: boolean // Tambahkan flag
  ): number => {
    const rowBottom = y + rowHeight;
    if (rowBottom > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawTableHeader(doc, y, colWidths, rowHeight, startX, fontPathBold);
      y += rowHeight; // Spasi setelah header baru
    }

    doc.font(fontPathRegular).fontSize(9);
    let currentX = startX;
    // Tentukan data yang akan ditampilkan, beri tanda jika tidak termasuk run
    const displayAllowance = isIncludedInRun ? allowance : '-';
    const displayDeduction = isIncludedInRun ? deduction : '-';
    const displayNetPay = isIncludedInRun ? netPay : '(Tidak Diproses)';

    const rowData = [itemNumber, name, baseSalary, displayAllowance, displayDeduction, displayNetPay];
    const aligns: PDFKit.Mixins.TextOptions['align'][] = ['center', 'left', 'right', 'right', 'right', 'right'];
    // Beri warna abu-abu jika tidak termasuk run
    const fillColor = isIncludedInRun ? 'black' : '#888888';

    rowData.forEach((cell, i) => {
        doc.fillColor(fillColor).text(cell, currentX + 2, y + 5, {
            width: colWidths[i] - 4,
            align: aligns[i]
        });
        currentX += colWidths[i];
    });

     doc.moveTo(startX, y + rowHeight).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y + rowHeight).lineWidth(0.5).strokeColor('#cccccc').stroke();

    return y + rowHeight;
};

// Handler export PDF
const exportPayrollRunPdfHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
  const adminUserId = request.user?.id;
  const runId = context?.params?.runId;

  if (!runId) {
    return NextResponse.json({ message: 'ID Payroll Run diperlukan.' }, { status: 400 });
  }

  console.log(`[API PDF Export Run All] Request for Payroll Run ID: ${runId} by Admin: ${adminUserId}`);

  try {
    // 1. Ambil data Payroll Run dan Payslip terkait
    const payrollRun = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        executedBy: { select: { name: true } },
        payslips: { // Ambil payslips dalam run ini
          include: {
            user: { select: { name: true, email: true, baseSalary: true } }, // Sertakan baseSalary user
          }
        }
      }
    });

    if (!payrollRun) {
         return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan.` }, { status: 404 });
    }
    // Tidak error jika payslips kosong, karena kita akan fetch semua user

    // 2. Ambil SEMUA Karyawan yang relevan (misal, bukan SUPER_ADMIN)
    const allRelevantUsers = await prisma.user.findMany({
        where: {
            role: {
                notIn: [Role.SUPER_ADMIN, Role.YAYASAN] // Sesuaikan role yang tidak ingin dimasukkan
            }
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, baseSalary: true } // Ambil data yang dibutuhkan
    });

    if (allRelevantUsers.length === 0) {
        return NextResponse.json({ message: 'Tidak ada data karyawan yang relevan untuk ditampilkan.' }, { status: 404 });
    }

    // 3. Buat Map dari payslips untuk pencarian cepat berdasarkan userId
    const payslipMap = new Map<string, PayslipWithUser>(
        payrollRun.payslips.map(p => [p.userId, p])
    );
    console.log(`[API PDF Export Run All] Created payslipMap with ${payslipMap.size} entries.`);

    // 4. Setup Dokumen PDF dan Font
    const fontDir = path.join(process.cwd(), 'src/assets/fonts');
    const fontPathRegular = path.join(fontDir, 'Roboto-Regular.ttf');
    const fontPathBold = path.join(fontDir, 'Roboto-Bold.ttf');

    if (!fs.existsSync(fontPathRegular) || !fs.existsSync(fontPathBold)) {
      console.error(`Font file not found! Path: ${fontDir}`);
      return NextResponse.json({ message: 'Kesalahan server: File font tidak ditemukan.' }, { status: 500 });
    }

    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 40, right: 40 },
        layout: 'portrait',
        bufferPages: true,
        font: fontPathRegular
    });

    const bufferPromise = streamToBuffer(doc);

    // 5. Gambar Header Dokumen
    doc.font(fontPathBold).fontSize(16).text('DAFTAR GAJI KARYAWAN (Semua)', { align: 'center' }); // Judul diubah
    doc.moveDown(0.5);
    doc.font(fontPathRegular).fontSize(11).text(
      `Periode Payroll Run: ${new Date(payrollRun.periodStart).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })} - ${new Date(payrollRun.periodEnd).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      { align: 'center' }
    );
    doc.fontSize(10).text(`Tanggal Eksekusi Run: ${new Date(payrollRun.executionDate).toLocaleString('id-ID')}`, { align: 'center'});
    doc.moveDown(1.5);

    // 6. Definisikan dan Gambar Header Tabel
    const tableTop = doc.y;
    const startX = doc.page.margins.left;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowHeight = 25;
    const colWidths = [ 35, 160, 80, 80, 80, 80 ]; // Sesuaikan jika perlu

     // Cek total lebar kolom
     const totalColWidth = colWidths.reduce((a,b) => a+b, 0);
     if(Math.abs(totalColWidth - tableWidth) > 1) {
         console.warn(`Lebar kolom (${totalColWidth}) tidak pas dengan lebar tabel (${tableWidth}). Harap sesuaikan colWidths.`);
     }

    drawTableHeader(doc, tableTop, colWidths, rowHeight, startX, fontPathBold);
    let currentY = tableTop + rowHeight;

    // 7. Loop melalui SEMUA Karyawan dan Gambar Isi Tabel
    allRelevantUsers.forEach((user, index) => {
      const itemNumber = (index + 1).toString();
      const name = user.name ?? 'N/A';
      // Ambil gaji pokok dari data user, bukan dari payslip (karena mungkin tidak ada)
      const baseSalary = formatCurrencyPdf(user.baseSalary);

      // Cek apakah user ini ada di payslipMap
      const payslip = payslipMap.get(user.id);
      const isIncludedInRun = !!payslip; // boolean flag

      // Ambil data dari payslip jika ada, jika tidak gunakan default/placeholder
      const allowance = isIncludedInRun ? formatCurrencyPdf(payslip?.totalAllowance) : '-';
      const deduction = isIncludedInRun ? formatCurrencyPdf(payslip?.totalDeduction) : '-';
      const netPay = isIncludedInRun ? formatCurrencyPdf(payslip?.netPay) : '(Tidak Diproses)';

      // Gambar baris
      currentY = drawTableRow(
          doc, currentY, itemNumber, name, baseSalary, allowance, deduction, netPay,
          colWidths, rowHeight, startX, fontPathRegular, fontPathBold,
          isIncludedInRun // Kirim flag
      );
    });

    // 8. Finalisasi Dokumen PDF
    doc.end();

    // 9. Dapatkan Buffer dan Kirim Respons
    const buffer = await bufferPromise;

    const headers = new Headers();
    headers.set('Content-Type', 'application/pdf');
    const safePeriodStart = payrollRun.periodStart.toISOString().split('T')[0];
    const safePeriodEnd = payrollRun.periodEnd.toISOString().split('T')[0];
    // Ubah nama file untuk menandakan ini daftar semua karyawan
    const fileName = `daftar-gaji-semua-karyawan-ref-run-${runId}-${safePeriodStart}_${safePeriodEnd}.pdf`;
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);

    console.log(`[API PDF Export Run All] PDF generated successfully for Run ID: ${runId}. Filename: ${fileName}`);
    return new NextResponse(buffer, { status: 200, headers });

  } catch (error: unknown) {
     console.error(`[API PDF Export Run All] Error for Payroll Run ID ${runId ?? 'unknown'}:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2025') { return NextResponse.json({ message: `Payroll Run ID '${runId}' tidak ditemukan.` }, { status: 404 }); }
       if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 }); }
       return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
     }
     if (error instanceof Error && error.message.includes('Font file not found')) {
         return NextResponse.json({ message: 'Kesalahan server: File font tidak dapat dimuat.' }, { status: 500 });
     }
     return NextResponse.json({ message: 'Gagal men-generate PDF daftar gaji.' }, { status: 500 });
  }
};

// Export metode GET
export const GET = withAuth(exportPayrollRunPdfHandler, Role.SUPER_ADMIN);
