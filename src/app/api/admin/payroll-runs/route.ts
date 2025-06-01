// src/app/api/admin/payroll-runs/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, PayrollRunStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import { calculatePayslipForUser } from '@/lib/payrollLogic'; // Pastikan path ini benar

// Handler POST untuk memulai Payroll Run
const createPayrollRunHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id;
    console.log(`[API POST /admin/payroll-runs] Request received from Admin: ${adminUserId}`);

    let periodStartStr: string | undefined;
    let periodEndStr: string | undefined;
    let userIds: string[] | undefined;

    try {
        const body = await request.json();
        periodStartStr = body.periodStart;
        periodEndStr = body.periodEnd;
        userIds = body.userIds; // Ini adalah array ID pengguna, atau undefined

        // Validasi Input Dasar
        if (!periodStartStr || !periodEndStr) {
            return NextResponse.json({ message: 'periodStart dan periodEnd (YYYY-MM-DD) wajib diisi.' }, { status: 400 });
        }
        const periodStart = new Date(periodStartStr);
        const periodEnd = new Date(periodEndStr);
        // Set periodEnd ke akhir hari untuk mencakup semua transaksi pada tanggal tersebut
        periodEnd.setUTCHours(23, 59, 59, 999);

        if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
             return NextResponse.json({ message: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD.' }, { status: 400 });
        }
        if (periodStart > periodEnd) {
             return NextResponse.json({ message: 'Tanggal mulai tidak boleh setelah tanggal akhir.' }, { status: 400 });
        }
         if (userIds && (!Array.isArray(userIds) || userIds.some(id => typeof id !== 'string'))) {
            return NextResponse.json({ message: 'userIds harus berupa array string jika disertakan.' }, { status: 400 });
        }

    } catch (e) {
        console.error('[API POST /admin/payroll-runs] Error parsing body:', e);
        return NextResponse.json({ message: 'Format request body tidak valid (JSON diperlukan).' }, { status: 400 });
    }

    let payrollRunResult;
    const failedUsers: { id: string, name?: string | null, reason: string }[] = [];
    let successfulPayslips: number = 0;

    try {
        // Gunakan transaksi Prisma untuk memastikan konsistensi data
        payrollRunResult = await prisma.$transaction(async (tx) => {
            console.log(`[Payroll Run TX] Starting transaction for period ${periodStartStr} - ${periodEndStr}`);

            // 1. Buat record PayrollRun awal
            const payrollRun = await tx.payrollRun.create({
                data: {
                    periodStart: new Date(periodStartStr as string), // Pastikan konversi ke Date
                    periodEnd: new Date(periodEndStr as string),   // Pastikan konversi ke Date
                    executedById: adminUserId,
                    // status akan default ke PENDING_APPROVAL sesuai skema
                }
            });
            console.log(`[Payroll Run TX ${payrollRun.id}] Created PayrollRun record with status: ${payrollRun.status}`);

            // 2. Ambil daftar User yang akan diproses
            const usersToProcess = await tx.user.findMany({
                where: {
                    id: userIds ? { in: userIds } : undefined, // Filter berdasarkan userIds jika ada
                    baseSalary: { not: null }, // Hanya proses user yang memiliki gaji pokok
                    role: { notIn: [Role.SUPER_ADMIN, Role.YAYASAN] } // Jangan proses admin/yayasan
                },
                select: { id: true, name: true, email: true } // Ambil info dasar untuk logging
            });
            console.log(`[Payroll Run TX ${payrollRun.id}] Found ${usersToProcess.length} users to process.`);

            if (usersToProcess.length === 0) {
                console.warn(`[Payroll Run TX ${payrollRun.id}] No users found to process based on criteria. Payroll run will have 0 payslips.`);
                // Tidak perlu menghentikan transaksi, payroll run tetap dibuat tapi kosong
            }

            // 3. Loop & Hitung Payslip untuk setiap User
            for (const user of usersToProcess) {
                console.log(`[Payroll Run TX ${payrollRun.id}] Calculating for User ID: ${user.id} (${user.name || user.email})`);
                try {
                    const payslipDetails = await calculatePayslipForUser(
                        user.id,
                        new Date(periodStartStr as string), // Pastikan Date object
                        new Date(periodEndStr as string),   // Pastikan Date object
                        tx // Teruskan Prisma Transaction Client
                    );

                    if (payslipDetails) {
                        // 4. Simpan Payslip dan PayslipItems
                        const createdPayslip = await tx.payslip.create({
                            data: {
                                payrollRunId: payrollRun.id,
                                userId: user.id,
                                baseSalary: payslipDetails.baseSalary,
                                totalAllowance: payslipDetails.totalAllowance,
                                grossPay: payslipDetails.grossPay,
                                totalDeduction: payslipDetails.totalDeduction,
                                netPay: payslipDetails.netPay,
                                attendanceDays: payslipDetails.attendanceDays,
                                lateDays: payslipDetails.lateDays,
                                alphaDays: payslipDetails.alphaDays,
                                items: { // Buat PayslipItems terkait
                                    createMany: {
                                        data: payslipDetails.items.map(item => ({
                                            type: item.type,
                                            description: item.description,
                                            amount: item.amount
                                        }))
                                    }
                                }
                            }
                        });
                        console.log(`[Payroll Run TX ${payrollRun.id}] Saved Payslip for User ${user.id}. Payslip ID: ${createdPayslip.id}`);
                        successfulPayslips++;
                    } else {
                         console.warn(`[Payroll Run TX ${payrollRun.id}] Skipping User ${user.id} (${user.name || user.email}) - Calculation returned null.`);
                         failedUsers.push({ id: user.id, name: user.name, reason: `Perhitungan gaji untuk ${user.name || user.email} menghasilkan null/kosong.` });
                    }
                } catch (calcError: any) { // Tangkap error spesifik per kalkulasi user
                    const reason = calcError instanceof Error ? calcError.message : "Error tidak diketahui saat kalkulasi slip gaji.";
                    console.error(`[Payroll Run TX ${payrollRun.id}] FAILED calculation for User ${user.id} (${user.name || user.email}): ${reason}`);
                    failedUsers.push({ id: user.id, name: user.name, reason: `Error kalkulasi gaji untuk ${user.name || user.email}: ${reason}` });
                    // Lanjutkan ke user berikutnya meskipun satu gagal
                }
            } // Akhir loop users

            console.log(`[Payroll Run TX ${payrollRun.id}] Transaction finished. Status: ${payrollRun.status}. ${successfulPayslips} payslips created. ${failedUsers.length} users failed/skipped.`);
            
            // Kembalikan hasil dari transaksi
            return {
                payrollRunId: payrollRun.id,
                status: payrollRun.status,
                periodStart: payrollRun.periodStart.toISOString().split('T')[0],
                periodEnd: payrollRun.periodEnd.toISOString().split('T')[0],
                executionDate: payrollRun.executionDate.toISOString(),
                processedUsersCount: usersToProcess.length,
                successfulPayslipsCount: successfulPayslips,
                failedUsersDetail: failedUsers // Kirim detail user yang gagal
            };

        }, {
             maxWait: 25000, // Waktu maksimum menunggu koneksi transaksi (ms)
             timeout: 60000, // Waktu maksimum transaksi berjalan (ms)
        });

        // Kirim respons sukses ke client
        let responseMessage = `Proses penggajian berhasil dibuat dengan status ${payrollRunResult.status}.`;
        responseMessage += ` ${payrollRunResult.successfulPayslipsCount} slip gaji berhasil dibuat.`;
        if (payrollRunResult.failedUsersDetail.length > 0) {
            responseMessage += ` ${payrollRunResult.failedUsersDetail.length} karyawan gagal/dilewati.`;
        }
        responseMessage += ` Menunggu persetujuan Yayasan.`;

        return NextResponse.json({
            message: responseMessage,
            data: payrollRunResult
        });

    } catch (error: unknown) {
        console.error('[API POST /admin/payroll-runs] Error during payroll run execution:', error);
        let errorMessage = 'Gagal menjalankan perhitungan payroll karena kesalahan server.';
        let errorDetails = null;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
             errorMessage = `Database error: ${error.message} (Code: ${error.code})`;
             errorDetails = { code: error.code, meta: error.meta };
        } else if (error instanceof Error) {
             errorMessage = error.message;
             errorDetails = error.stack;
        } else {
            errorDetails = String(error);
        }
        return NextResponse.json({ message: errorMessage, details: errorDetails }, { status: 500 });
    }
};


// Handler GET untuk mengambil semua Payroll Runs (SUDAH BENAR DENGAN INCLUDE PAYSLIPS)
const getPayrollRunsHandler = async (request: AuthenticatedRequest) => {
     console.log(`[API GET /admin/payroll-runs] Request received from Admin: ${request.user?.id}`);
     try {
         // Ambil parameter paginasi dari query URL jika ada
        const { searchParams } = request.nextUrl;
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        const skip = (page - 1) * limit;

        // Ambil total item untuk paginasi (tanpa skip dan take, bisa dengan filter jika ada)
        const totalItems = await prisma.payrollRun.count({
            // where: { ... } // Tambahkan filter di sini jika GET mendukung filter status, dll.
        });

         const payrollRuns = await prisma.payrollRun.findMany({
             orderBy: { executionDate: 'desc' },
             skip: skip,
             take: limit,
             include: {
                 executedBy: { select: { id: true, name: true, email: true } },
                 approvedBy: { select: { name: true } },
                 rejectedBy: { select: { name: true } },
                 payslips: {
                     orderBy: { user: { name: 'asc' } },
                     include: {
                         user: {
                             select: {
                                 id: true,
                                 name: true,
                                 email: true
                             }
                         }
                         // Untuk mengambil semua field dari payslip, hapus 'select' di level payslips
                         // atau tambahkan field yang dibutuhkan di 'select' ini.
                         // Contoh mengambil semua field payslip (termasuk items jika perlu):
                         // select: {
                         //     id: true, userId: true, baseSalary: true, totalAllowance: true, grossPay: true,
                         //     totalDeduction: true, netPay: true, attendanceDays: true, lateDays: true, alphaDays: true,
                         //     user: { select: { id: true, name: true, email: true }},
                         //     items: { select: { type: true, description: true, amount: true }} // Jika mau rincian item
                         // }
                     }
                 }
             }
         });

        const totalPages = Math.ceil(totalItems / limit);

         const formattedRuns = payrollRuns.map(run => ({
             id: run.id,
             periodStart: run.periodStart.toISOString().split('T')[0],
             periodEnd: run.periodEnd.toISOString().split('T')[0],
             executionDate: run.executionDate.toISOString(),
             status: run.status,
             executedById: run.executedById,
             approvedById: run.approvedById,
             approvedAt: run.approvedAt?.toISOString() || null,
             rejectedById: run.rejectedById,
             rejectedAt: run.rejectedAt?.toISOString() || null,
             rejectionReason: run.rejectionReason,
             createdAt: run.createdAt.toISOString(),
             updatedAt: run.updatedAt.toISOString(),
             executedBy: run.executedBy ? {
                 id: run.executedBy.id,
                 name: run.executedBy.name,
                 email: run.executedBy.email
             } : null,
             approvedByName: run.approvedBy?.name || null,
             rejectedByName: run.rejectedBy?.name || null,
             payslips: run.payslips.map(slip => {
                 return {
                     id: slip.id,
                     userId: slip.userId,
                     userName: slip.user?.name || 'N/A',
                     userEmail: slip.user?.email || 'N/A',
                     baseSalary: slip.baseSalary.toString(),
                     totalAllowance: slip.totalAllowance.toString(),
                     grossPay: slip.grossPay.toString(),
                     totalDeduction: slip.totalDeduction.toString(),
                     netPay: slip.netPay.toString(),
                     attendanceDays: slip.attendanceDays,
                     lateDays: slip.lateDays,
                     alphaDays: slip.alphaDays,
                     // Jika Anda include slip.items di atas, format juga di sini
                     // items: slip.items?.map(item => ({ ...item, amount: item.amount.toString() })) || []
                 };
             })
         }));

         return NextResponse.json({
            data: formattedRuns,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalItems
        });

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
