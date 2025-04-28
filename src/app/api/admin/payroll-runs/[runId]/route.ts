import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface RouteContext {
    params: { runId: string };
}

// Helper untuk serialisasi payslip
const serializePayslipSummary = (p: any) => ({
    id: p.id,
    userId: p.userId,
    userName: p.user?.name ?? null,
    userEmail: p.user?.email ?? null,
    baseSalary: p.baseSalary?.toString() ?? null,
    totalAllowance: p.totalAllowance?.toString() ?? null,
    grossPay: p.grossPay?.toString() ?? null,
    totalDeduction: p.totalDeduction?.toString() ?? null,
    netPay: p.netPay?.toString() ?? null,
    attendanceDays: p.attendanceDays,
    lateDays: p.lateDays,
    alphaDays: p.alphaDays,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
});

// Fungsi untuk generate PDF Payroll Run
const generatePDF = (payrollRun: any) => {
    const doc = new PDFDocument({ margin: 50 });

    doc.fontSize(18).text(`Payroll Run: ${payrollRun.name}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Period: ${payrollRun.periodStart} to ${payrollRun.periodEnd}`);
    doc.text(`Executed by: ${payrollRun.executedBy.name} (${payrollRun.executedBy.email})`);
    doc.text(`Execution Date: ${payrollRun.executionDate}`);
    doc.moveDown();

    doc.fontSize(14).text('Payslips:', { underline: true });
    doc.moveDown();

    payrollRun.payslips.forEach((p: any, i: number) => {
        doc.fontSize(12).text(`${i + 1}. ${p.userName} (${p.userEmail})`);
        doc.text(`   Base Salary: ${p.baseSalary}`);
        doc.text(`   Allowance: ${p.totalAllowance}`);
        doc.text(`   Gross Pay: ${p.grossPay}`);
        doc.text(`   Deductions: ${p.totalDeduction}`);
        doc.text(`   Net Pay: ${p.netPay}`);
        doc.moveDown();
    });

    doc.end();
    return doc;
};

const getPayrollRunDetailsHandler = async (request: AuthenticatedRequest & NextRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const runId = context?.params?.runId;

    if (!runId) {
        return NextResponse.json({ message: 'ID Payroll Run diperlukan di URL path.' }, { status: 400 });
    }

    const exportType = request.nextUrl.searchParams.get('export'); // ambil query param ?export=pdf

    try {
        const payrollRun = await prisma.payrollRun.findUnique({
            where: { id: runId },
            include: {
                executedBy: {
                    select: { id: true, name: true, email: true }
                },
                payslips: {
                    orderBy: { user: { name: 'asc' } },
                    include: {
                        user: {
                            select: { id: true, name: true, email: true }
                        }
                    }
                }
            }
        });

        if (!payrollRun) {
            return NextResponse.json({ message: `Payroll Run dengan ID '${runId}' tidak ditemukan.` }, { status: 404 });
        }

        const serializedData = {
            ...payrollRun,
            periodStart: payrollRun.periodStart.toISOString().split('T')[0],
            periodEnd: payrollRun.periodEnd.toISOString().split('T')[0],
            executionDate: payrollRun.executionDate.toISOString(),
            createdAt: payrollRun.createdAt.toISOString(),
            updatedAt: payrollRun.updatedAt.toISOString(),
            payslips: payrollRun.payslips.map(serializePayslipSummary)
        };

        if (exportType === 'pdf') {
            const pdfDoc = generatePDF(serializedData);
            const stream = new Readable({ read() {} });

            pdfDoc.on('data', (chunk) => stream.push(chunk));
            pdfDoc.on('end', () => stream.push(null));
            pdfDoc.end();

            return new NextResponse(stream as any, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="payroll-run-${runId}.pdf"`
                }
            });
        }

        return NextResponse.json(serializedData);

    } catch (error) {
        console.error(`[API GET /admin/payroll-runs/${runId}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
            return NextResponse.json({ message: 'Format ID Payroll Run tidak valid.' }, { status: 400 });
        }
        return NextResponse.json({ message: 'Gagal mengambil detail payroll run.' }, { status: 500 });
    }
};

// Endpoint GET hanya untuk SUPER_ADMIN
export const GET = withAuth(getPayrollRunDetailsHandler, Role.SUPER_ADMIN);
