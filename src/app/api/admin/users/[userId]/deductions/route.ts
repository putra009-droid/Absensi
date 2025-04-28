// src/app/api/admin/users/[userId]/deductions/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface untuk context params
interface RouteContext {
    params: { userId: string };
}

// Helper function untuk serialisasi UserDeduction
const serializeUserDeduction = (ud: any) => ({
    ...ud,
    assignedAmount: ud.assignedAmount?.toString() ?? null,
    assignedPercentage: ud.assignedPercentage?.toString() ?? null,
    // Sertakan detail DeductionType jika ada
    deductionType: ud.deductionType ? {
        id: ud.deductionType.id,
        name: ud.deductionType.name,
        calculationType: ud.deductionType.calculationType,
    } : null,
});

// =====================================================================
// ===      FUNGSI GET (List Deductions for a specific User)         ===
// =====================================================================
const getUserDeductionsHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id; // Admin yang request
    const userId = context?.params?.userId; // Ambil ID user dari context

    if (!userId) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
    console.log(`[API GET /admin/users/${userId}/deductions] Request by Admin: ${adminUserId}`);

    try {
        // Ambil UserDeduction yang HANYA relevan untuk assignment spesifik user
        // (FIXED_USER dan PERCENTAGE_USER)
        const userDeductions = await prisma.userDeduction.findMany({
            where: {
                userId: userId,
                // Filter hanya untuk tipe yang nilainya di-assign per user
                deductionType: {
                    calculationType: {
                        in: [DeductionCalculationType.FIXED_USER, DeductionCalculationType.PERCENTAGE_USER]
                    }
                }
            },
            include: {
                deductionType: { // Sertakan data dari DeductionType
                    select: { id: true, name: true, calculationType: true }
                }
            },
            orderBy: { deductionType: { name: 'asc' } }
        });

        // Cek apakah user ada jika tidak ada potongan ditemukan (opsional)
        if (userDeductions.length === 0) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
            }
        }

        const serializedDeductions = userDeductions.map(serializeUserDeduction);
        return NextResponse.json(serializedDeductions);

    } catch (error) {
        console.error(`[API GET /admin/users/${userId ?? 'unknown'}/deductions] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
           return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
        }
        return NextResponse.json({ message: 'Gagal mengambil data potongan pengguna.' }, { status: 500 });
    }
};


// =====================================================================
// === FUNGSI POST (Assign/Create Deduction for a specific User)     ===
// =====================================================================
const assignDeductionHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // Untuk logging
    const userId = context?.params?.userId;

    if (!userId) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
    console.log(`[API POST /admin/users/${userId}/deductions] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { deductionTypeId, assignedAmount: rawAmount, assignedPercentage: rawPercentage } = body;

        // --- Validasi Input ---
        if (!deductionTypeId || typeof deductionTypeId !== 'string') {
            return NextResponse.json({ message: 'ID Jenis Potongan (deductionTypeId) wajib diisi.' }, { status: 400 });
        }

        // Cek user dan deduction type ada, dan ambil calculationType-nya
        const [userExists, deductionTypeExists] = await Promise.all([
             prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
             prisma.deductionType.findUnique({ where: { id: deductionTypeId } }) // Ambil semua field
        ]);
        if (!userExists) {
             return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
        }
        if (!deductionTypeExists) {
             return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan.` }, { status: 404 });
        }

        // Siapkan data untuk disimpan
        const dataToCreate: Prisma.UserDeductionCreateInput = {
            user: { connect: { id: userId } },
            deductionType: { connect: { id: deductionTypeId } },
        };

        // Validasi amount/percentage berdasarkan calculationType
        if (deductionTypeExists.calculationType === DeductionCalculationType.FIXED_USER) {
            if (rawAmount === undefined || rawAmount === null || rawAmount === '') { return NextResponse.json({ message: `Jumlah Potongan (assignedAmount) wajib diisi untuk tipe ${deductionTypeExists.calculationType}.` }, { status: 400 }); }
            const amountNum = Number(rawAmount);
            if (isNaN(amountNum) || amountNum < 0) { return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus angka positif.' }, { status: 400 }); }
            dataToCreate.assignedAmount = new Prisma.Decimal(amountNum);
            dataToCreate.assignedPercentage = null;

        } else if (deductionTypeExists.calculationType === DeductionCalculationType.PERCENTAGE_USER) {
            if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') { return NextResponse.json({ message: `Persentase Potongan (assignedPercentage) wajib diisi untuk tipe ${deductionTypeExists.calculationType}.` }, { status: 400 }); }
            const percentNum = Number(rawPercentage);
            if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) { return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus 0-100.' }, { status: 400 }); }
            dataToCreate.assignedPercentage = new Prisma.Decimal(percentNum);
            dataToCreate.assignedAmount = null;

        } else {
            // Tipe kalkulasi lain tidak memerlukan assignment nilai spesifik user
            return NextResponse.json({ message: `Jenis potongan '${deductionTypeExists.name}' (${deductionTypeExists.calculationType}) tidak memerlukan nilai spesifik saat ditetapkan ke pengguna.` }, { status: 400 });
        }
        // --- Akhir Validasi Input ---

        // Buat UserDeduction baru
        const newUserDeduction = await prisma.userDeduction.create({
            data: dataToCreate,
            include: { // Sertakan detail DeductionType dalam response
               deductionType: { select: { id: true, name: true, calculationType: true } }
            }
        });

        console.log(`Potongan ${deductionTypeExists.name} (ID: ${newUserDeduction.id}) ditambahkan untuk user ${userExists.email} (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);

        return NextResponse.json(
            { message: 'Potongan berhasil ditambahkan untuk pengguna!', userDeduction: serializeUserDeduction(newUserDeduction) },
            { status: 201 } // 201 Created
        );

    } catch (error: unknown) {
        console.error(`[API POST /admin/users/${userId ?? 'unknown'}/deductions] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('UserDeduction_userId_deductionTypeId_key')) { return NextResponse.json({ message: 'Jenis potongan ini sudah ditambahkan untuk pengguna tersebut.' }, { status: 409 }); }
            if (error.code === 'P2003') { return NextResponse.json({ message: 'Referensi User atau Jenis Potongan tidak valid.'}, { status: 400 }); }
            if (error.code === 'P2023') { return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 }); }
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        if (error instanceof SyntaxError) { return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 }); }
        return NextResponse.json({ message: 'Gagal menambahkan potongan untuk pengguna.' }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getUserDeductionsHandler, Role.SUPER_ADMIN);
export const POST = withAuth(assignDeductionHandler, Role.SUPER_ADMIN);