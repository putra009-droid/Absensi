// src/app/api/payslips/me/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Prisma, PayrollRunStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Helper serialisasi untuk item payslip (tetap sama)
const serializePayslipItem = (item: any) => ({
    id: item.id,
    type: item.type,
    description: item.description,
    amount: item.amount?.toString() ?? null,
});

// Helper serialisasi untuk detail payslip (tetap sama)
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

    // --- PERBAIKAN 3: Struktur Filter whereClause ---
    // Inisialisasi whereClause dengan filter userId
    let whereClause: Prisma.PayslipWhereInput = {
        userId: userId,
        // Filter berdasarkan payrollRun ditempatkan di dalam 'is'
        payrollRun: {
            is: { // Gunakan 'is' untuk filter relasi
                status: PayrollRunStatus.APPROVED // Filter status di dalam 'is'
                // Filter periodStart akan ditambahkan di bawah jika ada
            }
        }
    };
    // --- Akhir Perbaikan Struktur Filter ---

    // Logika untuk menambahkan filter berdasarkan bulan/tahun jika ada
    if (yearParam && monthParam) {
        const year = parseInt(yearParam, 10);
        const monthIndex = parseInt(monthParam, 10) - 1; // Konversi 1-12 ke 0-11

        if (!isNaN(year) && !isNaN(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
            console.log(`[API GET /api/payslips/me] Filtering for User ${userId}, Year: ${year}, Month Index: ${monthIndex}`);
            const startDate = new Date(Date.UTC(year, monthIndex, 1));

            // Tambahkan filter periodStart ke dalam 'is' yang sudah ada
            // Pastikan whereClause.payrollRun dan whereClause.payrollRun.is ada
            if (whereClause.payrollRun && whereClause.payrollRun.is) {
                whereClause.payrollRun.is.periodStart = startDate; // Assign langsung ke properti
            } else {
                // Fallback jika struktur tidak terduga (seharusnya tidak terjadi)
                whereClause.payrollRun = {
                    is: { status: PayrollRunStatus.APPROVED, periodStart: startDate }
                };
            }
        } else {
             console.warn(`[API GET /api/payslips/me] Invalid year/month params for User ${userId}. Ignoring date filter.`);
             // Tidak perlu menghapus periodStart secara eksplisit karena whereClause dibuat ulang jika perlu
        }
    }
    // Jika tidak ada filter tahun/bulan, whereClause.payrollRun.is hanya akan berisi 'status'

    try {
        console.log("[API GET /api/payslips/me] Executing Prisma Query with Where Clause:", JSON.stringify(whereClause, null, 2));

        const payslips = await prisma.payslip.findMany({
            where: whereClause, // Terapkan filter gabungan
            orderBy: { payrollRun: { periodStart: 'desc' } },
            include: {
                payrollRun: {
                    select: {
                        periodStart: true,
                        periodEnd: true,
                        executionDate: true,
                        status: true
                    }
                },
                items: {
                    orderBy: [ { type: 'asc'}, {description: 'asc'} ]
                }
            }
        });

        console.log(`[API GET /api/payslips/me] Prisma findMany returned ${payslips.length} approved payslips for User ${userId}.`);

        const serializedPayslips = payslips.map(serializePayslipDetailForUser);
        return NextResponse.json(serializedPayslips);

    // PERBAIKAN 2: Penanganan error 'unknown'
    } catch (error: unknown) {
        console.error(`[API GET /api/payslips/me] Error fetching payslips for User ${userId}:`, error);

        let errorMessage = 'Gagal mengambil data slip gaji.'; // Default
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            // Handle error spesifik Prisma jika perlu (P2025 dll.)
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi
export const GET = withAuth(getMyPayslipsHandler); // Tidak perlu role spesifik