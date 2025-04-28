// src/app/api/admin/payslips/[payslipId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

interface RouteContext {
    params: { payslipId: string };
}

// Handler GET untuk detail Payslip
const getPayslipDetailsHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const payslipId = context?.params?.payslipId;

    if (!payslipId) {
        return NextResponse.json({ message: 'ID Payslip diperlukan di URL.' }, { status: 400 });
    }
    console.log(`[API GET /admin/payslips/${payslipId}] Request by Admin: ${adminUserId}`);

    try {
        const payslip = await prisma.payslip.findUnique({
            where: { id: payslipId },
            include: {
                // Sertakan detail user
                user: {
                    select: { id: true, name: true, email: true, role: true }
                },
                // Sertakan detail payroll run
                payrollRun: {
                    select: { id: true, periodStart: true, periodEnd: true, executionDate: true }
                },
                // Sertakan SEMUA item/rincian dalam payslip ini
                items: {
                    orderBy: [ { type: 'asc'}, {description: 'asc'} ] // Urutkan (misal: Allowance dulu, baru Deduction)
                }
            }
        });

        if (!payslip) {
            return NextResponse.json({ message: `Payslip dengan ID '${payslipId}' tidak ditemukan.` }, { status: 404 });
        }

        // Serialisasi Decimal sebelum mengirim respons
        const serializedPayslip = {
            ...payslip,
            baseSalary: payslip.baseSalary.toString(),
            totalAllowance: payslip.totalAllowance.toString(),
            grossPay: payslip.grossPay.toString(),
            totalDeduction: payslip.totalDeduction.toString(),
            netPay: payslip.netPay.toString(),
            payrollRun: { // Serialisasi tanggal di payrollRun juga
                ...payslip.payrollRun,
                periodStart: payslip.payrollRun.periodStart.toISOString().split('T')[0], // Format YYYY-MM-DD
                periodEnd: payslip.payrollRun.periodEnd.toISOString().split('T')[0],     // Format YYYY-MM-DD
                executionDate: payslip.payrollRun.executionDate.toISOString()
            },
            items: payslip.items.map(item => ({
                ...item,
                amount: item.amount.toString()
            }))
        };

        return NextResponse.json(serializedPayslip);

    } catch (error) {
        console.error(`[API GET /admin/payslips/${payslipId}] Error fetching details:`, error);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
           return NextResponse.json({ message: 'Format ID Payslip tidak valid.' }, { status: 400 });
        }
        return NextResponse.json({ message: 'Gagal mengambil detail payslip.' }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getPayslipDetailsHandler, Role.SUPER_ADMIN);

// Endpoint PUT/DELETE untuk payslip mungkin tidak umum, tapi bisa ditambahkan jika perlu