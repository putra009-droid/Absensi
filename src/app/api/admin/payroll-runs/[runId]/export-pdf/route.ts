// src/app/api/yayasan/payroll-runs/[runId]/employees/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: { runId: string };
// }

// Handler GET untuk mengambil daftar nama karyawan dalam satu Payroll Run (Perbaikan Signature Context)
const getPayrollRunEmployeesHandler = async (
    request: AuthenticatedRequest,
    // PERBAIKAN 3: Buat context dan params optional agar cocok dg middleware longgar
    context?: { params?: { runId?: string | string[] } }
) => {
    const yayasanUserId = request.user?.id;
    // Validasi internal untuk runId
    const runIdParam = context?.params?.runId;

    if (typeof runIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Payroll Run tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const runId = runIdParam; // Aman digunakan sebagai string

    console.log(`[API Get Employees] Request for Run ID: ${runId} by Yayasan: ${yayasanUserId}`);

    try {
        // Cari semua payslip yang terkait dengan runId
        const payslips = await prisma.payslip.findMany({
            where: {
                payrollRunId: runId
            },
            orderBy: {
                user: { name: 'asc' } // Urutkan berdasarkan nama user
            },
            include: {
                user: { // Sertakan data user
                    select: { name: true } // Hanya ambil nama
                }
            }
        });

        // Cek jika tidak ada payslip (meskipun run mungkin ada)
        if (payslips.length === 0) {
            // Cek dulu apakah Run ID nya valid
             const runExists = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { id: true } });
             if (!runExists) {
                 // Jika Run ID tidak valid, kembalikan 404
                 return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan.` }, { status: 404 });
             }
             // Jika Run ada tapi payslip kosong
             console.log(`[API Get Employees] No payslips found for Run ID: ${runId}. Returning empty list.`);
             return NextResponse.json([]); // Kembalikan array kosong
        }

        // Ekstrak nama pengguna dari hasil payslips
        const employeeNames = payslips.map(p => p.user?.name ?? 'Nama Tidak Diketahui');

        console.log(`[API Get Employees] Found ${employeeNames.length} employees for Run ID: ${runId}.`);

        // Kembalikan array berisi nama
        return NextResponse.json(employeeNames);

    // PERBAIKAN 2: Penanganan error 'unknown'
    } catch (error: unknown) {
        console.error(`[API Get Employees] Error processing Run ID ${runId ?? 'unknown'}:`, error);

        let errorMessage = 'Gagal mengambil daftar karyawan.'; // Default
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            // Cek spesifik P2023
            if (error.code === 'P2023') { // Invalid ID format (misal UUID salah)
                return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 });
            }
            // Handle error Prisma lainnya
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) { // Tangani error JS standar
            errorMessage = error.message;
        }
        // Error umum lainnya
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth, HANYA role YAYASAN yang bisa akses
// (Perbaikan 3 tercermin pada signature getPayrollRunEmployeesHandler di atas)
export const GET = withAuth(getPayrollRunEmployeesHandler, Role.YAYASAN);