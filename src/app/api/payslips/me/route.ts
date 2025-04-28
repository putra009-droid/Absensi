    // src/app/api/payslips/me/route.ts

    import { NextResponse } from 'next/server';
    import { prisma } from '@/lib/prisma';
    // Import Prisma, PayrollRunStatus, dan PrismaClientKnownRequestError
    import { Prisma, PayrollRunStatus, PrismaClientKnownRequestError } from '@prisma/client';
    import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

    // Helper serialisasi untuk item payslip
    const serializePayslipItem = (item: any) => ({
        id: item.id,
        type: item.type,
        description: item.description,
        amount: item.amount?.toString() ?? null,
    });

    // Helper serialisasi untuk detail payslip (termasuk status run)
    const serializePayslipDetailForUser = (p: any) => {
        const attendanceSummary = {
             attendanceDays: p.attendanceDays,
             lateDays: p.lateDays,
             alphaDays: p.alphaDays,
        };
        return {
            id: p.id,
            periodStart: p.payrollRun?.periodStart?.toISOString().split('T')[0] ?? null,
            periodEnd: p.payrollRun?.periodEnd?.toISOString().split('T')[0] ?? null,
            executionDate: p.payrollRun?.executionDate?.toISOString() ?? null,
            baseSalary: p.baseSalary?.toString() ?? null,
            totalAllowance: p.totalAllowance?.toString() ?? null,
            grossPay: p.grossPay?.toString() ?? null,
            totalDeduction: p.totalDeduction?.toString() ?? null,
            netPay: p.netPay?.toString() ?? null,
            items: p.items?.map(serializePayslipItem) ?? [],
            createdAt: p.createdAt?.toISOString() ?? null,
            // Sertakan status run agar frontend tahu statusnya
            payrollRunStatus: p.payrollRun?.status,
            ...attendanceSummary
        };
    };


    // Handler GET untuk user melihat slip gaji miliknya
    const getMyPayslipsHandler = async (request: AuthenticatedRequest) => {
        const userId = request.user?.id;
        if (!userId) {
            return NextResponse.json({ message: 'User ID tidak ditemukan dalam sesi.' }, { status: 401 });
        }
        console.log(`[API GET /api/payslips/me] Request received from User: ${userId}`);

        const { searchParams } = request.nextUrl;
        const yearParam = searchParams.get('year');
        const monthParam = searchParams.get('month'); // Frontend mengirim 1-12

        // --- Filter Awal: Hanya yang userId cocok DAN status run APPROVED ---
        let whereClause: Prisma.PayslipWhereInput = {
            userId: userId,
            // Filter berdasarkan status PayrollRun yang terkait
            payrollRun: {
                status: PayrollRunStatus.APPROVED // Hanya ambil payslip dari run yang sudah disetujui
            }
        };
        // --- Akhir Filter Awal ---

        // Logika untuk menambahkan filter berdasarkan bulan/tahun jika ada
        if (yearParam && monthParam) {
            const year = parseInt(yearParam, 10);
            const monthIndex = parseInt(monthParam, 10) - 1; // Konversi 1-12 ke 0-11

            if (!isNaN(year) && !isNaN(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
                console.log(`[API GET /api/payslips/me] Filtering for User ${userId}, Year: ${year}, Month Index: ${monthIndex}`);
                const startDate = new Date(Date.UTC(year, monthIndex, 1)); // Tanggal 1 UTC bulan/tahun target

                // Gabungkan filter tanggal dengan filter status yang sudah ada
                whereClause.payrollRun = {
                    ...whereClause.payrollRun, // Pertahankan status: APPROVED
                    // Cari PayrollRun yang periodStart-nya sama dengan tanggal 1 UTC bulan itu
                    // Pastikan tipe data periodStart di Prisma adalah Date atau DateTime
                    periodStart: startDate
                };
            } else {
                 console.warn(`[API GET /api/payslips/me] Invalid year/month params for User ${userId}. Ignoring date filter.`);
                 // Hapus filter tanggal jika tidak valid, tapi pertahankan filter status
                 if (whereClause.payrollRun) {
                     delete whereClause.payrollRun.periodStart;
                 }
            }
        } else {
             console.log(`[API GET /api/payslips/me] No period filter provided for User ${userId}. Fetching all approved.`);
             // Hapus filter tanggal jika tidak ada, tapi pertahankan filter status
             if (whereClause.payrollRun) {
                 delete whereClause.payrollRun.periodStart;
             }
        }


        try {
            console.log("[API GET /api/payslips/me] Executing Prisma Query with Where Clause:", JSON.stringify(whereClause, null, 2));

            const payslips = await prisma.payslip.findMany({
                where: whereClause, // Terapkan filter gabungan
                orderBy: { payrollRun: { periodStart: 'desc' } }, // Urutkan dari periode terbaru
                include: {
                    // Sertakan payrollRun untuk serialisasi dan menampilkan status
                    payrollRun: {
                        select: {
                            periodStart: true,
                            periodEnd: true,
                            executionDate: true,
                            status: true // Pastikan status di-select
                        }
                    },
                    // Sertakan items untuk detail slip gaji
                    items: {
                        orderBy: [ { type: 'asc'}, {description: 'asc'} ]
                    }
                }
            });

            console.log(`[API GET /api/payslips/me] Prisma findMany returned ${payslips.length} approved payslips for User ${userId}.`);

            // Serialisasi hasil sebelum dikirim ke frontend
            const serializedPayslips = payslips.map(serializePayslipDetailForUser);
            return NextResponse.json(serializedPayslips);

        } catch (error) {
            console.error(`[API GET /api/payslips/me] Error fetching payslips for User ${userId}:`, error);
            // Berikan respons error yang sesuai
            if (error instanceof PrismaClientKnownRequestError) {
                // Handle error spesifik Prisma jika perlu
                return NextResponse.json({ message: 'Database error saat mengambil slip gaji.', code: error.code }, { status: 500 });
            }
            return NextResponse.json({ message: 'Gagal mengambil data slip gaji.' }, { status: 500 });
        }
    };

    // Bungkus handler dengan middleware autentikasi (tidak perlu role spesifik)
    export const GET = withAuth(getMyPayslipsHandler);
    