// src/app/api/admin/payroll-runs/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, PayrollRunStatus } from '@prisma/client'; // Pastikan Prisma, Role, PayrollRunStatus diimpor
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import { calculatePayslipForUser } from '@/lib/payrollLogic';

// Handler POST untuk memulai Payroll Run (TETAP SAMA DARI SEBELUMNYA)
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
        userIds = body.userIds;

        if (!periodStartStr || !periodEndStr) {
            return NextResponse.json({ message: 'periodStart dan periodEnd (YYYY-MM-DD) wajib diisi.' }, { status: 400 });
        }
        const periodStart = new Date(periodStartStr);
        const periodEnd = new Date(periodEndStr);
        periodEnd.setUTCHours(23, 59, 59, 999); // Set ke akhir hari

        if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
             return NextResponse.json({ message: 'Format tanggal tidak valid.' }, { status: 400 });
        }
        if (periodStart > periodEnd) {
             return NextResponse.json({ message: 'Tanggal mulai tidak boleh setelah tanggal akhir.' }, { status: 400 });
        }
         if (userIds && (!Array.isArray(userIds) || userIds.some(id => typeof id !== 'string'))) {
            return NextResponse.json({ message: 'userIds harus berupa array string jika disertakan.' }, { status: 400 });
        }

    } catch (e) {
        return NextResponse.json({ message: 'Format request body tidak valid (JSON diperlukan).' }, { status: 400 });
    }

    let payrollRunResult;
    const failedUsers: { id: string, reason: string }[] = []; // Ubah jadi objek untuk alasan
    let successfulPayslips: number = 0;

    try {
        payrollRunResult = await prisma.$transaction(async (tx) => {
            console.log(`[Payroll Run] Starting transaction for period ${periodStartStr} - ${periodEndStr}`);

            const payrollRun = await tx.payrollRun.create({
                data: {
                    periodStart: new Date(periodStartStr as string),
                    periodEnd: new Date(periodEndStr as string),
                    executedById: adminUserId,
                    // status default PENDING_APPROVAL dari skema
                }
            });
            console.log(`[Payroll Run] Created PayrollRun record ID: ${payrollRun.id} with initial status: ${payrollRun.status}`);

            const usersToProcess = await tx.user.findMany({
                where: {
                    id: userIds ? { in: userIds } : undefined,
                    baseSalary: { not: null }, // Hanya proses user dengan gaji pokok
                    role: { notIn: [Role.SUPER_ADMIN, Role.YAYASAN] } // Filter role yang tidak digaji
                },
                select: { id: true, name: true } // Ambil nama untuk logging error
            });
            console.log(`[Payroll Run ${payrollRun.id}] Found ${usersToProcess.length} users to process.`);

            if (usersToProcess.length === 0) {
                console.warn(`[Payroll Run ${payrollRun.id}] No users found to process based on criteria.`);
                // Update status run menjadi COMPLETED_NO_USERS atau sejenisnya jika perlu,
                // atau biarkan PENDING_APPROVAL jika memang tidak ada yg diproses
                // Untuk saat ini, kita akan tetap lanjut dan hasilnya akan 0 payslip
            }

            for (const user of usersToProcess) {
                console.log(`[Payroll Run ${payrollRun.id}] Calculating for User ID: ${user.id} (${user.name})`);
                try {
                    const payslipDetails = await calculatePayslipForUser(
                        user.id,
                        new Date(periodStartStr as string),
                        new Date(periodEndStr as string),
                        tx
                    );

                    if (payslipDetails) {
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
                                items: {
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
                        console.log(`[Payroll Run ${payrollRun.id}] Saved Payslip for User ${user.id}. Payslip ID: ${createdPayslip.id}`);
                        successfulPayslips++;
                    } else {
                         console.warn(`[Payroll Run ${payrollRun.id}] Skipping User ${user.id} (${user.name}) - Calculation returned null.`);
                         failedUsers.push({ id: user.id, reason: `Perhitungan gaji ${user.name} null/kosong.` });
                    }
                } catch (calcError: any) { // Tangkap error spesifik
                    const reason = calcError instanceof Error ? calcError.message : "Error tidak diketahui saat kalkulasi";
                    console.error(`[Payroll Run ${payrollRun.id}] FAILED calculation for User ${user.id} (${user.name}): ${reason}`);
                    failedUsers.push({ id: user.id, reason: `Error kalkulasi gaji ${user.name}: ${reason}` });
                }
            }

            console.log(`[Payroll Run ${payrollRun.id}] Transaction finished. Status: ${payrollRun.status}. ${successfulPayslips} payslips created. ${failedUsers.length} users failed/skipped.`);

            // Jika tidak ada payslip yang berhasil dibuat dan ada user yang gagal, mungkin kita ingin statusnya berbeda
            // atau menambahkan detail kegagalan ke PayrollRun record.
            // Untuk sekarang, status tetap PENDING_APPROVAL.
            // if (successfulPayslips === 0 && usersToProcess.length > 0) {
            //    // Mungkin update status ke FAILED atau PENDING_WITH_ERRORS
            // }

            return {
                payrollRunId: payrollRun.id,
                status: payrollRun.status,
                periodStart: payrollRun.periodStart.toISOString().split('T')[0],
                periodEnd: payrollRun.periodEnd.toISOString().split('T')[0],
                executionDate: payrollRun.executionDate.toISOString(),
                processedUsers: usersToProcess.length,
                successfulPayslips: successfulPayslips,
                failedUsers: failedUsers // Kirim detail user yang gagal
            };

        }, {
             maxWait: 25000, // Tingkatkan timeout jika kalkulasi banyak user
             timeout: 60000,
        });

        return NextResponse.json({
            message: `Proses penggajian berhasil dibuat dengan status ${payrollRunResult.status}. ${payrollRunResult.successfulPayslips} slip gaji dibuat. ${payrollRunResult.failedUsers.length} karyawan gagal/dilewati. Menunggu persetujuan Yayasan.`,
            data: payrollRunResult
        });

    } catch (error: unknown) {
        console.error('[API POST /admin/payroll-runs] Transaction Error or Unhandled Error:', error);
        let errorMessage = 'Gagal menjalankan perhitungan payroll.';
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
             errorMessage = `Database error: ${error.message} (Code: ${error.code})`;
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage, details: error instanceof Error ? error.stack : String(error) }, { status: 500 });
    }
};


// Handler GET untuk mengambil semua Payroll Runs
const getPayrollRunsHandler = async (request: AuthenticatedRequest) => {
     console.log(`[API GET /admin/payroll-runs] Request received from Admin: ${request.user?.id}`);
     try {
         const payrollRuns = await prisma.payrollRun.findMany({
             orderBy: { executionDate: 'desc' },
             include: {
                 executedBy: { select: { id: true, name: true, email: true } },
                 approvedBy: { select: { name: true } }, // Untuk approvedByName
                 rejectedBy: { select: { name: true } }, // Untuk rejectedByName
                 // === PERUBAHAN UTAMA ADA DI SINI ===
                 payslips: {
                     orderBy: { user: { name: 'asc' } },
                     include: {
                         user: { // Sertakan detail user untuk setiap payslip
                             select: {
                                 id: true,
                                 name: true,
                                 email: true
                             }
                         }
                         // Anda bisa select field payslip spesifik jika tidak butuh semua:
                         // select: {
                         //     id: true, userId: true, netPay: true, baseSalary: true, totalAllowance: true, totalDeduction: true,
                         //     attendanceDays: true, lateDays: true, alphaDays: true,
                         //     user: { select: { id: true, name: true, email: true }}
                         // }
                     }
                 }
                 // === AKHIR PERUBAHAN ===
             }
         });

         // Format respons agar lebih ramah frontend
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
             executedBy: run.executedBy ? { // Pastikan executedBy tidak null
                 id: run.executedBy.id,
                 name: run.executedBy.name,
                 email: run.executedBy.email
             } : null,
             approvedByName: run.approvedBy?.name || null, // Ambil dari relasi
             rejectedByName: run.rejectedBy?.name || null, // Ambil dari relasi
             // Sertakan payslips yang sudah di-include
             payslips: run.payslips.map(slip => ({
                 id: slip.id,
                 userId: slip.userId,
                 userName: slip.user?.name || 'N/A', // Dari user yang di-include
                 userEmail: slip.user?.email || 'N/A', // Dari user yang di-include
                 baseSalary: slip.baseSalary.toString(), // Convert Decimal to string
                 totalAllowance: slip.totalAllowance.toString(),
                 totalDeduction: slip.totalDeduction.toString(),
                 netPay: slip.netPay.toString(),
                 attendanceDays: slip.attendanceDays,
                 lateDays: slip.lateDays,
                 alphaDays: slip.alphaDays,
                 // Anda bisa tambahkan items slip gaji di sini jika perlu, tapi mungkin terlalu banyak data untuk list utama
             }))
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


// Bungkus handler dengan middleware autentikasi
export const POST = withAuth(createPayrollRunHandler, Role.SUPER_ADMIN);
export const GET = withAuth(getPayrollRunsHandler, Role.SUPER_ADMIN);