// src/app/api/yayasan/payroll-runs/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
import { Role, Prisma, PayrollRunStatus, PrismaClientKnownRequestError } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Handler GET untuk Yayasan melihat Payroll Runs (default: PENDING_APPROVAL)
const getYayasanPayrollRunsHandler = async (request: AuthenticatedRequest) => {
    const yayasanUserId = request.user?.id;
    const yayasanEmail = request.user?.email;
    console.log(`[API GET /yayasan/payroll-runs] Request received from Yayasan: ${yayasanEmail} (ID: ${yayasanUserId})`);

    const { searchParams } = request.nextUrl;
    // Ambil parameter status dari query, default ke PENDING_APPROVAL jika tidak ada
    const statusFilterParam = searchParams.get('status');
    let statusFilter: PayrollRunStatus | undefined;

    // Validasi parameter status jika diberikan
    if (statusFilterParam) {
        if (Object.values(PayrollRunStatus).includes(statusFilterParam as PayrollRunStatus)) {
            statusFilter = statusFilterParam as PayrollRunStatus;
            console.log(`[API GET /yayasan/payroll-runs] Filtering by status: ${statusFilter}`);
        } else {
            console.warn(`[API GET /yayasan/payroll-runs] Invalid status parameter: ${statusFilterParam}. Defaulting to PENDING_APPROVAL.`);
            statusFilter = PayrollRunStatus.PENDING_APPROVAL;
        }
    } else {
        // Default filter jika parameter status tidak ada
        statusFilter = PayrollRunStatus.PENDING_APPROVAL;
        console.log(`[API GET /yayasan/payroll-runs] No status parameter. Defaulting to PENDING_APPROVAL.`);
    }

    try {
        // Query ke database dengan filter status
        const payrollRuns = await prisma.payrollRun.findMany({
            where: {
                status: statusFilter // Terapkan filter status
            },
            orderBy: { executionDate: 'desc' }, // Urutkan dari yang terbaru
            include: { // Sertakan relasi yang relevan untuk ditampilkan
                executedBy: { select: { id: true, name: true, email: true } },
                approvedBy: { select: { name: true } },
                rejectedBy: { select: { name: true } }
            }
        });

        console.log(`[API GET /yayasan/payroll-runs] Found ${payrollRuns.length} runs with status ${statusFilter}.`);

        // Format tanggal dan data lain sebelum mengirim
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

    } catch (error) {
        console.error('[API GET /yayasan/payroll-runs] Error fetching payroll runs:', error);
        if (error instanceof PrismaClientKnownRequestError) {
            return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ message: 'Gagal mengambil data payroll runs untuk Yayasan.' }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi, HANYA role YAYASAN
export const GET = withAuth(getYayasanPayrollRunsHandler, Role.YAYASAN);
