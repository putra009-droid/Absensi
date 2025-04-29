// src/app/api/yayasan/payroll-runs/[runId]/approve/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Role, Prisma, PayrollRunStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: { runId: string };
// }

// Handler untuk menyetujui Payroll Run (Perbaikan Signature Context)
const approvePayrollRunHandler = async (
    request: AuthenticatedRequest,
    // PERBAIKAN 3: Buat context dan params optional agar cocok dg middleware longgar
    context?: { params?: { runId?: string | string[] } }
) => {
    const yayasanUserId = request.user?.id; // ID user Yayasan yang melakukan aksi
    const yayasanEmail = request.user?.email; // Email untuk logging
    // Validasi internal untuk runId
    const runIdParam = context?.params?.runId;

    if (typeof runIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Payroll Run tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const runId = runIdParam; // Aman digunakan sebagai string

    // Validasi yayasanUserId (dari token)
    if (!yayasanUserId) {
        // Ini seharusnya tidak terjadi jika withAuth bekerja, tapi sebagai pengaman
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
            select: { // Pilih field yang ingin dikembalikan dalam respons
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

    // PERBAIKAN 2: Penanganan error 'unknown'
    } catch (error: unknown) {
        console.error(`[API Approve Payroll] Error processing Run ID ${runId ?? 'unknown'}:`, error);

        let errorMessage = 'Gagal menyetujui Payroll Run karena kesalahan server.'; // Default
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code; // Simpan kode error Prisma
            if (error.code === 'P2025') {
                 return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan saat update.` }, { status: 404 });
            }
            if (error.code === 'P2023') {
                return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 });
            }
            // Error Prisma lainnya
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) { // Tangani error JS standar
             errorMessage = error.message;
        }

        // Kembalikan error umum dengan pesan yang sudah dicek tipenya
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth, HANYA role YAYASAN yang bisa akses
// (Perbaikan 3 tercermin pada signature approvePayrollRunHandler di atas)
export const PUT = withAuth(approvePayrollRunHandler, Role.YAYASAN);