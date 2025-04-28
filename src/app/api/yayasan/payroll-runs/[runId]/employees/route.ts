// src/app/api/yayasan/payroll-runs/[runId]/employees/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
import { Role, Prisma, PrismaClientKnownRequestError } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Interface untuk context
interface RouteContext {
    params: { runId: string };
}

// Handler GET untuk mengambil daftar nama karyawan dalam satu Payroll Run
const getPayrollRunEmployeesHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const yayasanUserId = request.user?.id;
    const runId = context?.params?.runId;

    if (!runId) {
        return NextResponse.json({ message: 'ID Payroll Run diperlukan.' }, { status: 400 });
    }

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
        // Handle jika user.name bisa null
        const employeeNames = payslips.map(p => p.user?.name ?? 'Nama Tidak Diketahui');

        console.log(`[API Get Employees] Found ${employeeNames.length} employees for Run ID: ${runId}.`);

        // Kembalikan array berisi nama
        return NextResponse.json(employeeNames);

    } catch (error: unknown) {
        console.error(`[API Get Employees] Error processing Run ID ${runId}:`, error);
        if (error instanceof PrismaClientKnownRequestError) {
            if (error.code === 'P2023') { // Invalid ID format (misal UUID salah)
                return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 });
            }
            // Handle error Prisma lainnya
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        // Error umum lainnya
        return NextResponse.json({ message: 'Gagal mengambil daftar karyawan.' }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth, HANYA role YAYASAN yang bisa akses
export const GET = withAuth(getPayrollRunEmployeesHandler, Role.YAYASAN);
