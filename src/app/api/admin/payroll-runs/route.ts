    // src/app/api/admin/payroll-runs/route.ts

    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/prisma';
    // Pastikan PayrollRunStatus diimpor
    import { Role, Prisma, PayrollRunStatus, PrismaClientKnownRequestError } from '@prisma/client';
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
            // Set ke akhir hari untuk memastikan inklusif
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
            // Error jika body bukan JSON
            return NextResponse.json({ message: 'Format request body tidak valid (JSON diperlukan).' }, { status: 400 });
        }

        // Deklarasi variabel di luar try-catch transaksi
        let payrollRunResult;
        const failedUsers: string[] = [];
        let successfulPayslips: number = 0;

        try {
            // Gunakan transaksi Prisma untuk memastikan konsistensi data
            payrollRunResult = await prisma.$transaction(async (tx) => {
                console.log(`[Payroll Run] Starting transaction for period ${periodStartStr} - ${periodEndStr}`);

                // 1. Buat record PayrollRun awal
                // Status default PENDING_APPROVAL dari skema akan digunakan secara otomatis.
                // JANGAN set status: "PROCESSING" atau status string lainnya di sini.
                const payrollRun = await tx.payrollRun.create({
                    data: {
                        periodStart: new Date(periodStartStr as string), // Pastikan ini UTC jika @db.Date
                        periodEnd: new Date(periodEndStr as string),   // Pastikan ini UTC jika @db.Date
                        executedById: adminUserId, // Pastikan field ini ada dan sesuai di skema Anda
                    }
                });
                // Log status awal yang diambil dari DB setelah create
                console.log(`[Payroll Run] Created PayrollRun record ID: ${payrollRun.id} with initial status: ${payrollRun.status}`);

                // 2. Ambil daftar User yang akan diproses
                const usersToProcess = await tx.user.findMany({
                    where: {
                        id: userIds ? { in: userIds } : undefined, // Filter by userIds jika diberikan
                        baseSalary: { not: null }, // Hanya yang punya gaji pokok
                        role: { notIn: [Role.SUPER_ADMIN, Role.YAYASAN] } // Jangan proses admin/yayasan
                    },
                    select: { id: true } // Hanya perlu ID
                });
                console.log(`[Payroll Run ${payrollRun.id}] Found ${usersToProcess.length} users to process.`);

                // 3. Loop & Hitung Payslip untuk setiap User
                for (const user of usersToProcess) {
                    console.log(`[Payroll Run ${payrollRun.id}] Calculating for User ID: ${user.id}`);
                    try {
                        // Panggil fungsi kalkulasi gaji
                        const payslipDetails = await calculatePayslipForUser(
                            user.id,
                            new Date(periodStartStr as string), // Gunakan tanggal asli
                            new Date(periodEndStr as string),   // Gunakan tanggal asli
                            tx // Kirim transaction client
                        );

                        if (payslipDetails) {
                            // 4. Simpan Payslip dan Item-itemnya jika kalkulasi berhasil
                            const createdPayslip = await tx.payslip.create({
                                data: {
                                    payrollRunId: payrollRun.id, // Hubungkan ke PayrollRun
                                    userId: user.id,             // Hubungkan ke User
                                    baseSalary: payslipDetails.baseSalary,
                                    totalAllowance: payslipDetails.totalAllowance,
                                    grossPay: payslipDetails.grossPay,
                                    totalDeduction: payslipDetails.totalDeduction,
                                    netPay: payslipDetails.netPay,
                                    attendanceDays: payslipDetails.attendanceDays,
                                    lateDays: payslipDetails.lateDays,
                                    alphaDays: payslipDetails.alphaDays,
                                    // Buat item-item payslip
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
                            successfulPayslips++; // Tambah counter sukses
                        } else {
                             // Jika kalkulasi mengembalikan null (misal user tidak valid)
                             console.warn(`[Payroll Run ${payrollRun.id}] Skipping User ${user.id} - Calculation returned null.`);
                             failedUsers.push(user.id + " (Skipped)");
                        }
                    } catch (calcError) {
                        // Tangani error spesifik saat kalkulasi untuk satu user
                        console.error(`[Payroll Run ${payrollRun.id}] FAILED calculation for User ${user.id}:`, calcError);
                        failedUsers.push(user.id + " (Error)");
                        // PENTING: Putuskan apakah error 1 user menggagalkan seluruh run?
                        // Jika ya: throw calcError;
                        // Jika tidak (seperti saat ini): Lanjutkan ke user berikutnya
                    }
                } // Akhir loop users

                // 5. JANGAN UPDATE STATUS DI SINI LAGI
                // Status akan tetap PENDING_APPROVAL sampai diubah oleh Yayasan
                console.log(`[Payroll Run ${payrollRun.id}] Transaction finished. Status remains: ${payrollRun.status}. ${successfulPayslips} payslips created. ${failedUsers.length} users failed/skipped.`);

                // Kembalikan hasil dari transaksi (termasuk status PENDING_APPROVAL)
                return {
                    payrollRunId: payrollRun.id,
                    status: payrollRun.status, // Status aktual setelah create
                    processedUsers: usersToProcess.length,
                    successfulPayslips: successfulPayslips,
                    failedUserIds: failedUsers
                };

            }, {
                 maxWait: 15000, // Waktu tunggu maksimal transaction lock
                 timeout: 30000, // Waktu eksekusi maksimal transaction
            });

            // Kirim respons sukses ke client
            return NextResponse.json({
                message: `Payroll run berhasil dibuat dengan status ${payrollRunResult.status}. Menunggu persetujuan Yayasan.`, // Pesan disesuaikan
                data: payrollRunResult
            });

        } catch (error) {
            // Tangani error transaksi atau error tak terduga lainnya
            console.error('[API POST /admin/payroll-runs] Transaction Error or Unhandled Error:', error);
            // Berikan respons error umum
            return NextResponse.json({
                 message: 'Gagal menjalankan perhitungan payroll.',
                 // Sertakan detail error jika dalam mode development (hati-hati di produksi)
                 error: error instanceof Error ? error.message : 'Unknown server error.'
                }, { status: 500 });
        }
    };

    // Handler GET (tidak perlu diubah di langkah ini, tapi pastikan menyertakan status)
    const getPayrollRunsHandler = async (request: AuthenticatedRequest) => {
         console.log(`[API GET /admin/payroll-runs] Request received from Admin: ${request.user?.id}`);
         try {
             const payrollRuns = await prisma.payrollRun.findMany({
                 orderBy: { executionDate: 'desc' },
                 include: { // Sertakan relasi yang relevan
                     executedBy: { select: { id: true, name: true, email: true } },
                     approvedBy: { select: { name: true } }, // Info approver
                     rejectedBy: { select: { name: true } }  // Info rejecter
                 }
             });
             // Format tanggal dan data lain sebelum mengirim
             const formattedRuns = payrollRuns.map(run => ({
                 ...run,
                 periodStart: run.periodStart.toISOString().split('T')[0],
                 periodEnd: run.periodEnd.toISOString().split('T')[0],
                 executionDate: run.executionDate.toISOString(),
                 approvedAt: run.approvedAt?.toISOString() || null, // Kirim null jika tidak ada
                 rejectedAt: run.rejectedAt?.toISOString() || null, // Kirim null jika tidak ada
                 // Sertakan nama approver/rejecter jika perlu
                 approvedByName: run.approvedBy?.name || null,
                 rejectedByName: run.rejectedBy?.name || null,
             }));
             return NextResponse.json(formattedRuns);
         } catch (error) {
              console.error('[API GET /admin/payroll-runs] Error fetching payroll runs:', error);
              if (error instanceof PrismaClientKnownRequestError) {
                  return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
              }
              return NextResponse.json({ message: 'Gagal mengambil data payroll runs.' }, { status: 500 });
         }
    };


    // Bungkus handler dengan middleware autentikasi
    export const POST = withAuth(createPayrollRunHandler, Role.SUPER_ADMIN);
    export const GET = withAuth(getPayrollRunsHandler, Role.SUPER_ADMIN);
    