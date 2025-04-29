// src/app/api/admin/payslips/[payslipId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client'; // Pastikan Prisma diimpor
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: { payslipId: string };
// }

// Handler GET untuk detail Payslip (Perbaikan Signature Context)
const getPayslipDetailsHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional, gunakan nama param yg benar '[payslipId]'
    context?: { params?: { payslipId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    // Validasi internal payslipId
    const payslipIdParam = context?.params?.payslipId;
    if (typeof payslipIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Payslip tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const payslipId = payslipIdParam; // Aman digunakan

    console.log(`[API GET /admin/payslips/${payslipId}] Request by Admin: ${adminUserId}`);

    try {
        const payslip = await prisma.payslip.findUnique({
            where: { id: payslipId },
            include: {
                user: {
                    select: { id: true, name: true, email: true, role: true }
                },
                payrollRun: {
                    select: { id: true, periodStart: true, periodEnd: true, executionDate: true }
                },
                items: {
                    orderBy: [ { type: 'asc'}, {description: 'asc'} ]
                }
            }
        });

        if (!payslip) {
            return NextResponse.json({ message: `Payslip dengan ID '${payslipId}' tidak ditemukan.` }, { status: 404 });
        }

        // Serialisasi Decimal (Pastikan relasi payrollRun ada sebelum akses)
        const serializedPayslip = {
            ...payslip,
            baseSalary: payslip.baseSalary.toString(),
            totalAllowance: payslip.totalAllowance.toString(),
            grossPay: payslip.grossPay.toString(),
            totalDeduction: payslip.totalDeduction.toString(),
            netPay: payslip.netPay.toString(),
            payrollRun: payslip.payrollRun ? { // Cek null untuk payrollRun
                ...payslip.payrollRun,
                periodStart: payslip.payrollRun.periodStart.toISOString().split('T')[0],
                periodEnd: payslip.payrollRun.periodEnd.toISOString().split('T')[0],
                executionDate: payslip.payrollRun.executionDate.toISOString()
            } : null, // Kembalikan null jika relasi tidak ada
            items: payslip.items.map(item => ({
                ...item,
                amount: item.amount.toString()
            }))
        };

        return NextResponse.json(serializedPayslip);

    // PERBAIKAN BLOK CATCH
    } catch (error: unknown) {
        console.error(`[API GET /admin/payslips/${payslipId ?? 'unknown'}] Error fetching details:`, error); // Gunakan payslipId yang sudah divalidasi
        let errorMessage = 'Gagal mengambil detail payslip.'; // Default

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            if (error.code === 'P2023') {
               errorMessage = 'Format ID Payslip tidak valid.';
               return NextResponse.json({ message: errorMessage }, { status: 400 });
            }
           // Error Prisma lainnya
           return NextResponse.json({ message: errorMessage }, { status: 500 });
        } else if (error instanceof Error) { // Tangani error JS standar
             errorMessage = error.message;
        }
        // Kembalikan error umum
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth dan role SUPER_ADMIN (Perbaikan tercermin di signature handler)
export const GET = withAuth(getPayslipDetailsHandler, Role.SUPER_ADMIN);

// Endpoint PUT/DELETE untuk payslip mungkin tidak umum, tapi bisa ditambahkan jika perlu