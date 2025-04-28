// src/app/api/yayasan/payroll-runs/[runId]/approve/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
import { Role, Prisma, PayrollRunStatus, PrismaClientKnownRequestError } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Interface untuk menangkap parameter dinamis dari context
interface RouteContext {
    params: { runId: string };
}

// Handler untuk menyetujui Payroll Run
const approvePayrollRunHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const yayasanUserId = request.user?.id; // ID user Yayasan yang melakukan aksi
    const yayasanEmail = request.user?.email; // Email untuk logging
    const runId = context?.params?.runId;

    // Validasi dasar
    if (!runId) {
        return NextResponse.json({ message: 'ID Payroll Run diperlukan di URL path.' }, { status: 400 });
    }
    if (!yayasanUserId) {
        return NextResponse.json({ message: 'ID pengguna Yayasan tidak valid.' }, { status: 401 });
    }

    console.log(`[API Approve Payroll] Request for Run ID: ${runId} by Yayasan: ${yayasanEmail} (ID: ${yayasanUserId})`);

    try {
        // 1. Cari Payroll Run yang akan disetujui untuk validasi status
        const payrollRun = await prisma.payrollRun.findUnique({
            where: { id: runId },
            select: { status: true } // Hanya perlu status
        });

        // 2. Handle jika tidak ditemukan
        if (!payrollRun) {
            return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan.` }, { status: 404 });
        }

        // 3. Validasi Status: Hanya bisa setujui jika status PENDING_APPROVAL
        if (payrollRun.status !== PayrollRunStatus.PENDING_APPROVAL) {
            return NextResponse.json(
                { message: `Payroll Run ini tidak dapat disetujui karena statusnya saat ini adalah '${payrollRun.status}'.` },
                { status: 400 } // Bad Request
            );
        }

        // 4. Lakukan Update Status ke APPROVED
        const updatedPayrollRun = await prisma.payrollRun.update({
            where: { id: runId },
            data: {
                status: PayrollRunStatus.APPROVED,   // Set status baru
                approvedById: yayasanUserId,         // Catat siapa yang menyetujui
                approvedAt: new Date(),              // Catat waktu persetujuan
                // Kosongkan field penolakan jika mungkin sebelumnya ditolak
                rejectedById: null,
                rejectedAt: null,
                rejectionReason: null,
            },
            // Pilih field yang ingin dikembalikan dalam respons
            select: {
                id: true,
                status: true,
                approvedAt: true,
                approvedBy: { select: { name: true } } // Ambil nama approver
            }
        });

        console.log(`[API Approve Payroll] Payroll Run ID: ${runId} approved successfully by ${yayasanEmail}.`);

        // 5. Kirim Respons Sukses
        return NextResponse.json({
            message: 'Payroll Run berhasil disetujui!',
            payrollRun: updatedPayrollRun
        });

    } catch (error: unknown) {
        console.error(`[API Approve Payroll] Error processing Run ID ${runId}:`, error);
        // Tangani error Prisma
        if (error instanceof PrismaClientKnownRequestError) {
            if (error.code === 'P2025') { // Record to update not found
                 return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan saat update.` }, { status: 404 });
            }
            if (error.code === 'P2023') { // Invalid ID format
                return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 });
            }
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        // Error umum lainnya
        return NextResponse.json({ message: 'Gagal menyetujui Payroll Run karena kesalahan server.' }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth, HANYA role YAYASAN yang bisa akses
export const PUT = withAuth(approvePayrollRunHandler, Role.YAYASAN);
