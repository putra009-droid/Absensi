// src/app/api/yayasan/payroll-runs/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Role, Prisma, PayrollRunStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Handler GET untuk Yayasan melihat Payroll Runs (default: PENDING_APPROVAL)
const getYayasanPayrollRunsHandler = async (request: AuthenticatedRequest) => {
    const yayasanUserId = request.user?.id;
    const yayasanEmail = request.user?.email;
    console.log(`[API GET /yayasan/payroll-runs] Request received from Yayasan: ${yayasanEmail} (ID: ${yayasanUserId})`);

    const { searchParams } = request.nextUrl;
    const statusFilterParam = searchParams.get('status');
    let statusFilter: PayrollRunStatus | undefined;

    if (statusFilterParam) {
        if (Object.values(PayrollRunStatus).includes(statusFilterParam as PayrollRunStatus)) {
            statusFilter = statusFilterParam as PayrollRunStatus;
            console.log(`[API GET /yayasan/payroll-runs] Filtering by status: ${statusFilter}`);
        } else {
            console.warn(`[API GET /yayasan/payroll-runs] Invalid status parameter: ${statusFilterParam}. Defaulting to PENDING_APPROVAL.`);
            statusFilter = PayrollRunStatus.PENDING_APPROVAL;
        }
    } else {
        statusFilter = PayrollRunStatus.PENDING_APPROVAL;
        console.log(`[API GET /yayasan/payroll-runs] No status parameter. Defaulting to PENDING_APPROVAL.`);
    }

    try {
        const payrollRuns = await prisma.payrollRun.findMany({
            where: {
                status: statusFilter
            },
            orderBy: { executionDate: 'desc' },
            include: {
                executedBy: { select: { id: true, name: true, email: true } },
                approvedBy: { select: { name: true } },
                rejectedBy: { select: { name: true } }
            }
        });

        console.log(`[API GET /yayasan/payroll-runs] Found ${payrollRuns.length} runs with status ${statusFilter}.`);

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

    // PERBAIKAN 2: Tangani error 'unknown' dengan benar
    } catch (error: unknown) { // Definisikan tipe error sebagai unknown
        console.error('[API GET /yayasan/payroll-runs] Error fetching payroll runs:', error);

        let errorMessage = 'Gagal mengambil data payroll runs untuk Yayasan.'; // Pesan default
        // Cek tipe error sebelum akses properti
        if (error instanceof Prisma.PrismaClientKnownRequestError) { // Gunakan Prisma.<NamaError>
            errorMessage = `Database error: ${error.message}`;
            // Anda bisa akses error.code di sini jika perlu
        } else if (error instanceof Error) { // Tangani error JS standar
             errorMessage = error.message;
        }

        // Kembalikan pesan error yang sudah aman
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi, HANYA role YAYASAN
export const GET = withAuth(getYayasanPayrollRunsHandler, Role.YAYASAN);