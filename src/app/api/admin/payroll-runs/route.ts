// src/app/api/admin/payroll-runs/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, PayrollRunStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
// import { calculatePayslipForUser } from '@/lib/payrollLogic'; // Tidak digunakan di GET handler ini

// Handler POST createPayrollRunHandler (ASUMSI TIDAK BERUBAH)
// ... (kode createPayrollRunHandler Anda) ...
const createPayrollRunHandler = async (request: AuthenticatedRequest) => {
    // ...isi fungsi createPayrollRunHandler Anda yang sudah ada...
    // Contoh:
    const adminUserId = request.user?.id;
    console.log(`[API POST /admin/payroll-runs] Request received from Admin: ${adminUserId}`);
    // ... dst ...
    // Ini hanya contoh, pastikan kode lengkap Anda ada di sini
    try {
        // Logika membuat payroll run...
        // Contoh respons jika berhasil
        // return NextResponse.json({ message: "Payroll run berhasil dibuat", data: { payrollRunId: "someId" } });
        // Ganti dengan implementasi Anda yang sebenarnya
        const body = await request.json(); // pastikan body di-parse
        // ... (validasi body, panggil prisma.$transaction, calculatePayslipForUser, dll.) ...
        // Ambil dari kode lengkap yang saya berikan sebelumnya untuk createPayrollRunHandler
        // Jika Anda butuh kode lengkapnya lagi, beri tahu saya.
         return NextResponse.json({ message: "Contoh POST handler" }); // Placeholder
    } catch (error) {
        console.error('[API POST /admin/payroll-runs] Error:', error);
        return NextResponse.json({ message: "Error di POST handler" }, { status: 500 }); // Placeholder
    }
};


// === Handler GET untuk mengambil semua Payroll Runs (INI YANG PERLU DIPASTIKAN) ===
const getPayrollRunsHandler = async (request: AuthenticatedRequest) => {
     console.log(`[API GET /admin/payroll-runs] Request received from Admin: ${request.user?.id}`);
     try {
         const payrollRuns = await prisma.payrollRun.findMany({
             orderBy: { executionDate: 'desc' },
             include: { // <=================== BAGIAN PENTING ===================
                 executedBy: { select: { id: true, name: true, email: true } },
                 approvedBy: { select: { name: true } },
                 rejectedBy: { select: { name: true } },
                 payslips: { // <--------------- TAMBAHKAN/PASTIKAN INCLUDE INI
                     orderBy: { user: { name: 'asc' } },
                     include: {
                         user: { // Sertakan detail user untuk setiap payslip
                             select: {
                                 id: true,
                                 name: true,
                                 email: true
                             }
                         }
                         // Jika Anda butuh semua field payslip, tidak perlu 'select' di dalam 'payslips'.
                         // Jika hanya field tertentu, gunakan 'select' seperti contoh:
                         // select: {
                         //     id: true, userId: true, netPay: true, baseSalary: true,
                         //     totalAllowance: true, totalDeduction: true,
                         //     attendanceDays: true, lateDays: true, alphaDays: true,
                         //     user: { select: { id: true, name: true, email: true }}
                         // }
                     }
                 }
             } // <=================== AKHIR BAGIAN PENTING ===================
         });

         const formattedRuns = payrollRuns.map(run => ({
             id: run.id,
             periodStart: run.periodStart.toISOString().split('T')[0],
             periodEnd: run.periodEnd.toISOString().split('T')[0],
             executionDate: run.executionDate.toISOString(),
             status: run.status,
             // ... field run lainnya ...
             executedBy: run.executedBy ? {
                 id: run.executedBy.id,
                 name: run.executedBy.name,
                 email: run.executedBy.email
             } : null,
             approvedByName: run.approvedBy?.name || null,
             rejectedByName: run.rejectedBy?.name || null,
             // Sertakan payslips yang sudah di-include dan diformat
             payslips: run.payslips.map(slip => {
                 // Pastikan semua field yang dibutuhkan frontend ada di sini
                 // dan Decimal dikonversi ke string
                 return {
                     id: slip.id,
                     userId: slip.userId,
                     userName: slip.user?.name || 'N/A',
                     userEmail: slip.user?.email || 'N/A',
                     baseSalary: slip.baseSalary.toString(),
                     totalAllowance: slip.totalAllowance.toString(),
                     grossPay: slip.grossPay.toString(), // Tambahkan jika ada di model dan di-include
                     totalDeduction: slip.totalDeduction.toString(),
                     netPay: slip.netPay.toString(),
                     attendanceDays: slip.attendanceDays,
                     lateDays: slip.lateDays,
                     alphaDays: slip.alphaDays,
                     // Jika payslip memiliki 'items' (rincian tunjangan/potongan),
                     // Anda mungkin perlu meng-include dan memformatnya juga di sini jika
                     // modal detail karyawan akan menampilkannya.
                 };
             })
         }));
         return NextResponse.json(formattedRuns);

     } catch (error: unknown) {
          console.error('[API GET /admin/payroll-runs] Error fetching payroll runs:', error);
          let errorMessage = 'Gagal mengambil data payroll runs.';
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
              errorMessage = `Database error: ${error.message}`;
          } else if (error instanceof Error) {
               errorMessage = error.message;
          }
          return NextResponse.json({ message: errorMessage }, { status: 500 });
     }
};

export const POST = withAuth(createPayrollRunHandler, Role.SUPER_ADMIN);
export const GET = withAuth(getPayrollRunsHandler, Role.SUPER_ADMIN);