// src/app/api/admin/users/[userId]/allowances/[userAllowanceId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client'; // Pastikan Prisma diimpor
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: {
//         userId: string;
//         userAllowanceId: string;
//     };
// }

// Helper function untuk serialisasi Decimal (tidak berubah)
const serializeUserAllowance = (ua: any) => ({
    ...ua,
    amount: ua.amount?.toString() ?? null,
     allowanceType: ua.allowanceType ? {
      id: ua.allowanceType.id,
      name: ua.allowanceType.name
    } : null,
});


// =====================================================================
// ===        FUNGSI PUT (Update Amount for User Allowance)          ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const updateUserAllowanceHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional, sebutkan kedua params
    context?: { params?: { userId?: string | string[], userAllowanceId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;

    // Validasi internal userId dan userAllowanceId
    const userIdParam = context?.params?.userId;
    const userAllowanceIdParam = context?.params?.userAllowanceId;

    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    if (typeof userAllowanceIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User Allowance ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan
    const userAllowanceId = userAllowanceIdParam; // Aman digunakan

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

        // 3. Lakukan Update
        const updateResult = await prisma.userAllowance.updateMany({
            where: {
                id: userAllowanceId,
                userId: userId,
            },
            data: {
                amount: amountToSave,
            },
        });

        // 4. Cek Hasil Update
        if (updateResult.count === 0) {
            const allowanceExists = await prisma.userAllowance.findUnique({ where: { id: userAllowanceId }, select: { userId: true} });
            if (!allowanceExists) {
                return NextResponse.json({ message: `Penetapan tunjangan dengan ID '${userAllowanceId}' tidak ditemukan.` }, { status: 404 });
            } else if (allowanceExists.userId !== userId) {
                 return NextResponse.json({ message: `Penetapan tunjangan ID '${userAllowanceId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
            } else {
                 console.warn(`Update count was 0 for UserAllowance ${userAllowanceId} although it exists and userId matches.`);
                 return NextResponse.json({ message: `Gagal memperbarui tunjangan (tidak ada perubahan atau error tak terduga).` }, { status: 400 });
            }
        }

        console.log(`Tunjangan (ID: ${userAllowanceId}) untuk User (ID: ${userId}) diupdate jumlahnya oleh admin ${adminEmail} (ID: ${adminUserId})`);

        // 5. Ambil data yang baru diupdate
        const updatedAllowance = await prisma.userAllowance.findUnique({
            where: { id: userAllowanceId },
            include: { allowanceType: { select: {id: true, name: true} } }
        });

        // 6. Kirim Respons Sukses
        return NextResponse.json(
            { message: 'Jumlah tunjangan berhasil diperbarui!', userAllowance: updatedAllowance ? serializeUserAllowance(updatedAllowance) : null },
            { status: 200 }
        );

    // Penanganan error unknown sudah benar di sini
    } catch (error: unknown) {
        console.error(`[API PUT /admin/users/${userId ?? 'unknown'}/allowances/${userAllowanceId ?? 'unknown'}] Error:`, error);
        let errorMessage = 'Gagal memperbarui jumlah tunjangan.';
        let errorCode: string | undefined = undefined;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            if (error.code === 'P2023') {
                errorMessage = 'Format ID User atau ID Tunjangan tidak valid.';
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


// =====================================================================
// ===     FUNGSI DELETE (Remove Allowance Assignment from User)     ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const deleteUserAllowanceHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional, sebutkan kedua params
    context?: { params?: { userId?: string | string[], userAllowanceId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;

    // Validasi internal userId dan userAllowanceId
    const userIdParam = context?.params?.userId;
    const userAllowanceIdParam = context?.params?.userAllowanceId;

    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    if (typeof userAllowanceIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User Allowance ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan
    const userAllowanceId = userAllowanceIdParam; // Aman digunakan

    console.log(`[API DELETE /admin/users/${userId}/allowances/${userAllowanceId}] Request by Admin: ${adminUserId}`);

    try {
        // Hapus UserAllowance
        const deleteResult = await prisma.userAllowance.deleteMany({
            where: {
                id: userAllowanceId,
                userId: userId,
            },
        });

        // Cek Hasil Delete
        if (deleteResult.count === 0) {
             const allowanceExists = await prisma.userAllowance.findUnique({ where: { id: userAllowanceId }, select: { userId: true } });
             if (!allowanceExists) {
                 return NextResponse.json({ message: `Penetapan tunjangan dengan ID '${userAllowanceId}' tidak ditemukan.` }, { status: 404 });
             } else if (allowanceExists.userId !== userId) {
                  return NextResponse.json({ message: `Penetapan tunjangan ID '${userAllowanceId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
             } else {
                   console.warn(`Delete count was 0 for UserAllowance ${userAllowanceId} although it exists and userId matches.`);
                  return NextResponse.json({ message: `Gagal menghapus tunjangan (error tak terduga).` }, { status: 500 });
             }
        }

        console.log(`Tunjangan (ID: ${userAllowanceId}) dihapus dari User (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Penetapan tunjangan berhasil dihapus dari pengguna.' }, { status: 200 });

    // Penanganan error unknown sudah benar di sini
    } catch (error: unknown) {
        console.error(`[API DELETE /admin/users/${userId ?? 'unknown'}/allowances/${userAllowanceId ?? 'unknown'}] Error:`, error);
        let errorMessage = 'Gagal menghapus penetapan tunjangan.';
        let errorCode: string | undefined = undefined;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            if (error.code === 'P2023') {
                 errorMessage = 'Format ID User atau ID Tunjangan tidak valid.';
                 return NextResponse.json({ message: errorMessage }, { status: 400 });
            }
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN (Perbaikan tercermin di signature handler)
export const PUT = withAuth(updateUserAllowanceHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteUserAllowanceHandler, Role.SUPER_ADMIN);