// src/app/api/admin/users/[userId]/allowances/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client'; // Pastikan Prisma diimpor
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//  params: { userId: string };
// }

// Helper function untuk serialisasi Decimal (tidak berubah)
const serializeUserAllowance = (ua: any) => ({
    ...ua,
    amount: ua.amount?.toString() ?? null,
    allowanceType: ua.allowanceType ? {
      id: ua.allowanceType.id,
      name: ua.allowanceType.name,
      description: ua.allowanceType.description,
      isFixed: ua.allowanceType.isFixed,
    } : null,
});

// =====================================================================
// ===      FUNGSI GET (List Allowances for a specific User)         ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const getUserAllowancesHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional
    context?: { params?: { userId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    // Validasi internal userId
    const userIdParam = context?.params?.userId;
    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan

    console.log(`[API GET /admin/users/${userId}/allowances] Request by Admin: ${adminUserId}`);

    try {
        // Ambil semua UserAllowance
        const userAllowances = await prisma.userAllowance.findMany({
            where: { userId: userId },
            include: {
                allowanceType: {
                    select: { id: true, name: true, description: true, isFixed: true }
                }
            },
            orderBy: { allowanceType: { name: 'asc' } }
        });

        // Cek user jika tunjangan kosong
        if (userAllowances.length === 0) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
            }
        }

        const serializedAllowances = userAllowances.map(serializeUserAllowance);
        return NextResponse.json(serializedAllowances);

    // Penanganan error unknown sudah benar
    } catch (error: unknown) {
        console.error(`[API GET /admin/users/${userId}/allowances] Error:`, error);
        let errorMessage = 'Gagal mengambil data tunjangan pengguna.';
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
             errorMessage = `Database error: ${error.message}`;
             if (error.code === 'P2023') {
                 errorMessage = 'Format User ID tidak valid.';
                 return NextResponse.json({ message: errorMessage }, { status: 400 });
             }
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};


// =====================================================================
// === FUNGSI POST (Assign/Create Allowance for a specific User)     ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const assignAllowanceHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional
    context?: { params?: { userId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    // Validasi internal userId
    const userIdParam = context?.params?.userId;
    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan

    console.log(`[API POST /admin/users/${userId}/allowances] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { allowanceTypeId, amount: rawAmount } = body;

        // Validasi Input
        if (!allowanceTypeId || typeof allowanceTypeId !== 'string') {
            return NextResponse.json({ message: 'ID Jenis Tunjangan (allowanceTypeId) wajib diisi.' }, { status: 400 });
        }
        if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
            return NextResponse.json({ message: 'Jumlah tunjangan (amount) wajib diisi.' }, { status: 400 });
        }
        const amountNumber = Number(rawAmount);
        if (isNaN(amountNumber) || amountNumber < 0) {
            return NextResponse.json({ message: 'Jumlah tunjangan (amount) harus berupa angka positif.' }, { status: 400 });
        }
        const amountToSave = new Prisma.Decimal(amountNumber);

        // Cek user dan allowance type
        const [userExists, allowanceTypeExists] = await Promise.all([
             prisma.user.findUnique({ where: { id: userId }, select: { email: true} }),
             prisma.allowanceType.findUnique({ where: { id: allowanceTypeId }, select: { name: true} })
        ]);
        if (!userExists) {
             return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
        }
        if (!allowanceTypeExists) {
             return NextResponse.json({ message: `Jenis tunjangan dengan ID '${allowanceTypeId}' tidak ditemukan.` }, { status: 404 });
        }

        // Buat UserAllowance baru
        const newUserAllowance = await prisma.userAllowance.create({
            data: {
                userId: userId,
                allowanceTypeId: allowanceTypeId,
                amount: amountToSave,
            },
            include: {
                allowanceType: { select: { id: true, name: true } }
            }
        });

        console.log(`Tunjangan ${allowanceTypeExists.name} (ID: ${newUserAllowance.id}) ditambahkan untuk user ${userExists.email} (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);

        return NextResponse.json(
            { message: 'Tunjangan berhasil ditambahkan untuk pengguna!', userAllowance: serializeUserAllowance(newUserAllowance) },
            { status: 201 }
        );

    // Penanganan error unknown sudah benar
    } catch (error: unknown) {
        console.error(`[API POST /admin/users/${userId}/allowances] Error:`, error);
        let errorMessage = 'Gagal menambahkan tunjangan untuk pengguna.';
        let errorCode: string | undefined = undefined;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('UserAllowance_userId_allowanceTypeId_key')) {
                errorMessage = 'Jenis tunjangan ini sudah ditambahkan untuk pengguna tersebut.';
                return NextResponse.json({ message: errorMessage }, { status: 409 });
            }
            if (error.code === 'P2003') {
                 errorMessage = 'Referensi User atau Jenis Tunjangan tidak valid saat membuat data.';
                 return NextResponse.json({ message: errorMessage}, { status: 400 });
            }
            if (error.code === 'P2023') {
                 errorMessage = 'Format User ID tidak valid.';
                 return NextResponse.json({ message: errorMessage }, { status: 400 });
            }
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof SyntaxError) {
            errorMessage = 'Format body request tidak valid (JSON).';
            return NextResponse.json({ message: errorMessage }, { status: 400 });
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN (Perbaikan tercermin di signature handler)
export const GET = withAuth(getUserAllowancesHandler, Role.SUPER_ADMIN);
export const POST = withAuth(assignAllowanceHandler, Role.SUPER_ADMIN);