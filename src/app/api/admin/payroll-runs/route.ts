// src/app/api/admin/payroll-runs/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Pastikan PayrollRunStatus diimpor
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Role, Prisma, PayrollRunStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import { calculatePayslipForUser } from '@/lib/payrollLogic';

// Handler POST untuk memulai Payroll Run
const createPayrollRunHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id;
    console.log(`[API POST /admin/payroll-runs] Request received from Admin: ${adminUserId}`);

    let periodStartStr: string | undefined;
    let periodEndStr: string | undefined;
    let userIds: string[] | undefined;

    try {
        // Parse body request
        const body = await request.json();
        periodStartStr = body.periodStart;
        periodEndStr = body.periodEnd;
        userIds = body.userIds; // Opsional: untuk memproses user tertentu saja

        // Validasi Input
        if (!periodStartStr || !periodEndStr) {
            return NextResponse.json({ message: 'periodStart dan periodEnd (YYYY-MM-DD) wajib diisi.' }, { status: 400 });
        }
        const periodStart = new Date(periodStartStr);
        const periodEnd = new Date(periodEndStr);
        periodEnd.setUTCHours(23, 59, 59, 999);

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
    const failedUsers: string[] = [];
    let successfulPayslips: number = 0;

    try {
        // Gunakan transaksi Prisma
        payrollRunResult = await prisma.$transaction(async (tx) => {
            console.log(`[Payroll Run] Starting transaction for period ${periodStartStr} - ${periodEndStr}`);

            // 1. Buat record PayrollRun awal
            const payrollRun = await tx.payrollRun.create({
                data: {
                    periodStart: new Date(periodStartStr as string),
                    periodEnd: new Date(periodEndStr as string),
                    executedById: adminUserId,
                }
            });
            console.log(`[Payroll Run] Created PayrollRun record ID: ${payrollRun.id} with initial status: ${payrollRun.status}`);

            // 2. Ambil daftar User yang akan diproses
            const usersToProcess = await tx.user.findMany({
                where: {
                    id: userIds ? { in: userIds } : undefined,
                    baseSalary: { not: null },
                    role: { notIn: [Role.SUPER_ADMIN, Role.YAYASAN] }
                },
                select: { id: true }
            });
            console.log(`[Payroll Run ${payrollRun.id}] Found ${usersToProcess.length} users to process.`);

            // 3. Loop & Hitung Payslip untuk setiap User
            for (const user of usersToProcess) {
                console.log(`[Payroll Run ${payrollRun.id}] Calculating for User ID: ${user.id}`);
                try {
                    const payslipDetails = await calculatePayslipForUser(
                        user.id,
                        new Date(periodStartStr as string),
                        new Date(periodEndStr as string),
                        tx
                    );

                    if (payslipDetails) {
                        // 4. Simpan Payslip
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
                         console.warn(`[Payroll Run ${payrollRun.id}] Skipping User ${user.id} - Calculation returned null.`);
                         failedUsers.push(user.id + " (Skipped)");
                    }
                } catch (calcError) {
                    console.error(`[Payroll Run ${payrollRun.id}] FAILED calculation for User ${user.id}:`, calcError);
                    failedUsers.push(user.id + " (Error)");
                    // Lanjutkan ke user berikutnya
                }
            } // Akhir loop users

            console.log(`[Payroll Run ${payrollRun.id}] Transaction finished. Status remains: ${payrollRun.status}. ${successfulPayslips} payslips created. ${failedUsers.length} users failed/skipped.`);

            // Kembalikan hasil dari transaksi
            return {
                payrollRunId: payrollRun.id,
                status: payrollRun.status,
                processedUsers: usersToProcess.length,
                successfulPayslips: successfulPayslips,
                failedUserIds: failedUsers
            };

        }, {
             maxWait: 15000,
             timeout: 30000,
        });

        // Kirim respons sukses ke client
        return NextResponse.json({
            message: `Payroll run berhasil dibuat dengan status ${payrollRunResult.status}. Menunggu persetujuan Yayasan.`,
            data: payrollRunResult
        });

    // PERBAIKAN 2: Penanganan error 'unknown'
    } catch (error: unknown) {
        console.error('[API POST /admin/payroll-runs] Transaction Error or Unhandled Error:', error);
        let errorMessage = 'Gagal menjalankan perhitungan payroll.'; // Default
        // Cek tipe error sebelum akses properti
        if (error instanceof Prisma.PrismaClientKnownRequestError) { // Gunakan Prisma.<NamaError>
             errorMessage = `Database error during transaction: ${error.message}`;
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Handler GET (Perbaikan Catch Block)
const getPayrollRunsHandler = async (request: AuthenticatedRequest) => {
     console.log(`[API GET /admin/payroll-runs] Request received from Admin: ${request.user?.id}`);
     try {
         const payrollRuns = await prisma.payrollRun.findMany({
             orderBy: { executionDate: 'desc' },
             include: {
                 executedBy: { select: { id: true, name: true, email: true } },
                 approvedBy: { select: { name: true } },
                 rejectedBy: { select: { name: true } }
             }
         });
         const formattedRuns = payrollRuns.map(run => ({
             ...run,
             periodStart: run.periodStart.toISOString().split('T')[0],
             periodEnd: run.periodEnd.toISOString().split('T')[0],
             executionDate: run.executionDate.toISOString(),
             approvedAt: run.approvedAt?.toISOString() || null,
             rejectedAt: run.rejectedAt?.toISOString() || null,
             approvedByName: run.approvedBy?.name || null,
             rejectedByName: run.rejectedBy?.name || null,
         }));
         return NextResponse.json(formattedRuns);
     // PERBAIKAN 2: Penanganan error 'unknown'
     } catch (error: unknown) {
          console.error('[API GET /admin/payroll-runs] Error fetching payroll runs:', error);
          let errorMessage = 'Gagal mengambil data payroll runs.'; // Default
          // Cek tipe error
          if (error instanceof Prisma.PrismaClientKnownRequestError) { // Gunakan Prisma.<NamaError>
              errorMessage = `Database error: ${error.message}`;
          } else if (error instanceof Error) {
               errorMessage = error.message;
          }
          return NextResponse.json({ message: errorMessage }, { status: 500 });
     }
};


// Bungkus handler dengan middleware autentikasi (Tetap sama)
export const POST = withAuth(createPayrollRunHandler, Role.SUPER_ADMIN);
export const GET = withAuth(getPayrollRunsHandler, Role.SUPER_ADMIN);