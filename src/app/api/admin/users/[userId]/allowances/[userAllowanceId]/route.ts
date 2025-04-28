// src/app/api/admin/users/[userId]/allowances/[userAllowanceId]/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface untuk menangkap parameter dinamis dari context
interface RouteContext {
    params: {
        userId: string;
        userAllowanceId: string;
    };
}

// Helper function untuk serialisasi Decimal (jika diperlukan)
const serializeUserAllowance = (ua: any) => ({
    ...ua,
    amount: ua.amount?.toString() ?? null,
     allowanceType: ua.allowanceType ? { // Sertakan jika ada saat include
      id: ua.allowanceType.id,
      name: ua.allowanceType.name
    } : null,
});


// =====================================================================
// ===        FUNGSI PUT (Update Amount for User Allowance)          ===
// =====================================================================
const updateUserAllowanceHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id; // Admin yang request
    const adminEmail = request.user?.email; // Untuk logging
    const userId = context?.params?.userId; // Ambil dari context
    const userAllowanceId = context?.params?.userAllowanceId; // Ambil dari context

    if (!userId || !userAllowanceId) {
        return NextResponse.json({ message: 'User ID dan User Allowance ID diperlukan di URL path.' }, { status: 400 });
    }
     console.log(`[API PUT /admin/users/${userId}/allowances/${userAllowanceId}] Request by Admin: ${adminUserId}`);

    try {
        // 1. Parse Body
        let rawAmount: string | number | undefined | null;
        try {
            const body = await request.json();
            rawAmount = body.amount;
        } catch (e) {
             return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }


        // 2. Validasi Input Amount
        if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
            return NextResponse.json({ message: 'Jumlah tunjangan (amount) wajib diisi.' }, { status: 400 });
        }
        const amountNumber = Number(rawAmount);
        if (isNaN(amountNumber) || amountNumber < 0) {
            return NextResponse.json({ message: 'Jumlah tunjangan (amount) harus berupa angka positif.' }, { status: 400 });
        }
        const amountToSave = new Prisma.Decimal(amountNumber);

        // 3. Lakukan Update menggunakan updateMany dengan filter ID dan userId
        // Ini memastikan hanya admin yang bisa update record milik user yang benar via URL
        const updateResult = await prisma.userAllowance.updateMany({
            where: {
                id: userAllowanceId,
                userId: userId, // Pastikan sesuai dengan user di URL
            },
            data: {
                amount: amountToSave,
            },
        });

        // 4. Cek Hasil Update
        if (updateResult.count === 0) {
            // Jika count 0, cek alasannya: record tidak ada ATAU userId tidak cocok
            const allowanceExists = await prisma.userAllowance.findUnique({ where: { id: userAllowanceId }, select: { userId: true} });
            if (!allowanceExists) {
                return NextResponse.json({ message: `Penetapan tunjangan dengan ID '${userAllowanceId}' tidak ditemukan.` }, { status: 404 });
            } else if (allowanceExists.userId !== userId) {
                 // User ID di URL tidak cocok dengan pemilik record tunjangan ini
                 return NextResponse.json({ message: `Penetapan tunjangan ID '${userAllowanceId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
            } else {
                 // Record ada dan userId cocok, tapi tidak terupdate (mungkin jumlah sama atau error lain?)
                 console.warn(`Update count was 0 for UserAllowance ${userAllowanceId} although it exists and userId matches.`);
                 return NextResponse.json({ message: `Gagal memperbarui tunjangan (tidak ada perubahan atau error tak terduga).` }, { status: 400 }); // Atau 500
            }
        }

        console.log(`Tunjangan (ID: ${userAllowanceId}) untuk User (ID: ${userId}) diupdate jumlahnya oleh admin ${adminEmail} (ID: ${adminUserId})`);

        // 5. Ambil data yang baru diupdate untuk response (opsional tapi bagus)
        const updatedAllowance = await prisma.userAllowance.findUnique({
            where: { id: userAllowanceId },
            include: { allowanceType: { select: {id: true, name: true} } } // Include tipe tunjangan
        });

        // 6. Kirim Respons Sukses
        return NextResponse.json(
            { message: 'Jumlah tunjangan berhasil diperbarui!', userAllowance: updatedAllowance ? serializeUserAllowance(updatedAllowance) : null },
            { status: 200 }
        );

    } catch (error: unknown) {
        console.error(`[API PUT /admin/users/${userId ?? 'unknown'}/allowances/${userAllowanceId ?? 'unknown'}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID User atau ID Tunjangan tidak valid.' }, { status: 400 }); }
            // Handle error prisma lain
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
         if (error instanceof SyntaxError) {
             return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Error umum
        return NextResponse.json({ message: 'Gagal memperbarui jumlah tunjangan.' }, { status: 500 });
    }
};


// =====================================================================
// ===     FUNGSI DELETE (Remove Allowance Assignment from User)     ===
// =====================================================================
const deleteUserAllowanceHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // Untuk logging
    const userId = context?.params?.userId;
    const userAllowanceId = context?.params?.userAllowanceId;

    if (!userId || !userAllowanceId) {
        return NextResponse.json({ message: 'User ID dan User Allowance ID diperlukan di URL path.' }, { status: 400 });
    }
     console.log(`[API DELETE /admin/users/${userId}/allowances/${userAllowanceId}] Request by Admin: ${adminUserId}`);

    try {
        // Hapus UserAllowance, pastikan ID dan userId sesuai
        const deleteResult = await prisma.userAllowance.deleteMany({
            where: {
                id: userAllowanceId,
                userId: userId, // Filter berdasarkan userId di URL juga
            },
        });

        // Cek Hasil Delete
        if (deleteResult.count === 0) {
             // Jika count 0, cek alasannya: record tidak ada ATAU userId tidak cocok
             const allowanceExists = await prisma.userAllowance.findUnique({ where: { id: userAllowanceId }, select: { userId: true } });
             if (!allowanceExists) {
                 return NextResponse.json({ message: `Penetapan tunjangan dengan ID '${userAllowanceId}' tidak ditemukan.` }, { status: 404 });
             } else if (allowanceExists.userId !== userId) {
                  return NextResponse.json({ message: `Penetapan tunjangan ID '${userAllowanceId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
             } else {
                  // Seharusnya tidak terjadi jika record ada dan userId cocok
                   console.warn(`Delete count was 0 for UserAllowance ${userAllowanceId} although it exists and userId matches.`);
                  return NextResponse.json({ message: `Gagal menghapus tunjangan (error tak terduga).` }, { status: 500 });
             }
        }

        console.log(`Tunjangan (ID: ${userAllowanceId}) dihapus dari User (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Penetapan tunjangan berhasil dihapus dari pengguna.' }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API DELETE /admin/users/${userId ?? 'unknown'}/allowances/${userAllowanceId ?? 'unknown'}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID User atau ID Tunjangan tidak valid.' }, { status: 400 }); }
            // Handle error prisma lain
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
         if (error instanceof SyntaxError) { // Body JSON tidak valid
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Error umum
        return NextResponse.json({ message: 'Gagal menghapus penetapan tunjangan.' }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN
export const PUT = withAuth(updateUserAllowanceHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteUserAllowanceHandler, Role.SUPER_ADMIN);

// Handler GET untuk detail UserAllowance spesifik biasanya tidak diperlukan,
// karena detailnya sudah ada di list GET /api/admin/users/[userId]/allowances
// Tapi jika perlu, bisa ditambahkan:
// const getUserAllowanceDetailHandler = async (request: AuthenticatedRequest, context?: RouteContext) => { ... }
// export const GET = withAuth(getUserAllowanceDetailHandler, Role.SUPER_ADMIN);