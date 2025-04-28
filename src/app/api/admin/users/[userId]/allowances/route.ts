// src/app/api/admin/users/[userId]/allowances/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface untuk context params
interface RouteContext {
  params: { userId: string };
}

// Helper function untuk serialisasi Decimal (jika diperlukan)
const serializeUserAllowance = (ua: any) => ({
    ...ua,
    amount: ua.amount?.toString() ?? null,
    // Sertakan detail AllowanceType jika di-include dalam query
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
const getUserAllowancesHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id; // Admin yang request
    const userId = context?.params?.userId; // User ID dari URL

    if (!userId) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
     console.log(`[API GET /admin/users/${userId}/allowances] Request by Admin: ${adminUserId}`);

    try {
        // Ambil semua UserAllowance untuk userId tertentu
        const userAllowances = await prisma.userAllowance.findMany({
            where: { userId: userId },
            include: { // Sertakan detail tipe tunjangan
                allowanceType: {
                    select: { id: true, name: true, description: true, isFixed: true }
                }
            },
            orderBy: { allowanceType: { name: 'asc' } } // Urutkan
        });

        // Cek apakah user ada jika tidak ada tunjangan ditemukan (opsional tapi bagus)
        if (userAllowances.length === 0) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
            }
        }

        // Serialisasi hasil sebelum dikirim
        const serializedAllowances = userAllowances.map(serializeUserAllowance);
        return NextResponse.json(serializedAllowances);

    } catch (error) {
        console.error(`[API GET /admin/users/${userId}/allowances] Error:`, error);
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
             return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
         }
        return NextResponse.json({ message: 'Gagal mengambil data tunjangan pengguna.' }, { status: 500 });
    }
};


// =====================================================================
// === FUNGSI POST (Assign/Create Allowance for a specific User)     ===
// =====================================================================
const assignAllowanceHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // Untuk logging
    const userId = context?.params?.userId;

    if (!userId) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
     console.log(`[API POST /admin/users/${userId}/allowances] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { allowanceTypeId, amount: rawAmount } = body;

        // Validasi Input
        if (!allowanceTypeId || typeof allowanceTypeId !== 'string') {
            return NextResponse.json({ message: 'ID Jenis Tunjangan (allowanceTypeId) wajib diisi.' }, { status: 400 });
        }
        // Validasi Amount (harus ada dan angka positif)
        if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
            return NextResponse.json({ message: 'Jumlah tunjangan (amount) wajib diisi.' }, { status: 400 });
        }
        const amountNumber = Number(rawAmount);
        if (isNaN(amountNumber) || amountNumber < 0) {
            return NextResponse.json({ message: 'Jumlah tunjangan (amount) harus berupa angka positif.' }, { status: 400 });
        }
        const amountToSave = new Prisma.Decimal(amountNumber);

        // (Opsional tapi bagus) Cek apakah user dan allowance type benar-benar ada
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
            include: { // Sertakan detail tipe untuk respons
                allowanceType: { select: { id: true, name: true } }
            }
        });

        console.log(`Tunjangan ${allowanceTypeExists.name} (ID: ${newUserAllowance.id}) ditambahkan untuk user ${userExists.email} (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);

        // Kembalikan data yang sudah diserialisasi
        return NextResponse.json(
            { message: 'Tunjangan berhasil ditambahkan untuk pengguna!', userAllowance: serializeUserAllowance(newUserAllowance) },
            { status: 201 } // 201 Created
        );

    } catch (error: unknown) {
        console.error(`[API POST /admin/users/${userId}/allowances] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Error unique constraint (user sudah punya tunjangan jenis ini)
            if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('UserAllowance_userId_allowanceTypeId_key')) {
                return NextResponse.json({ message: 'Jenis tunjangan ini sudah ditambahkan untuk pengguna tersebut.' }, { status: 409 }); // 409 Conflict
            }
            // Error foreign key (userId atau allowanceTypeId tidak ditemukan saat create)
            if (error.code === 'P2003') {
                 return NextResponse.json({ message: 'Referensi User atau Jenis Tunjangan tidak valid saat membuat data.'}, { status: 400 });
            }
             // Error format ID
            if (error.code === 'P2023') {
                 return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
            }
            // Error Prisma lain
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
         if (error instanceof SyntaxError) { // Body JSON tidak valid
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Error umum
        return NextResponse.json({ message: 'Gagal menambahkan tunjangan untuk pengguna.' }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getUserAllowancesHandler, Role.SUPER_ADMIN);
export const POST = withAuth(assignAllowanceHandler, Role.SUPER_ADMIN);