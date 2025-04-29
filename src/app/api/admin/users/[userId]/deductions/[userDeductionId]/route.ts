// src/app/api/admin/users/[userId]/deductions/[userDeductionId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client'; // Pastikan Prisma diimpor
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: {
//         userId: string;
//         userDeductionId: string;
//     };
// }

// Helper function untuk serialisasi UserDeduction (tidak berubah)
const serializeUserDeduction = (ud: any) => ({
    ...ud,
    assignedAmount: ud.assignedAmount?.toString() ?? null,
    assignedPercentage: ud.assignedPercentage?.toString() ?? null,
    deductionType: ud.deductionType ? {
      id: ud.deductionType.id,
      name: ud.deductionType.name,
      calculationType: ud.deductionType.calculationType,
    } : null,
});


// =====================================================================
// ===        FUNGSI PUT (Update Amount/Percentage for User Deduction) ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const updateUserDeductionHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional, sebutkan kedua params
    context?: { params?: { userId?: string | string[], userDeductionId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;

    // Validasi internal userId dan userDeductionId
    const userIdParam = context?.params?.userId;
    const userDeductionIdParam = context?.params?.userDeductionId;

    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    if (typeof userDeductionIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User Deduction ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan
    const userDeductionId = userDeductionIdParam; // Aman digunakan

    console.log(`[API PUT /admin/users/${userId}/deductions/${userDeductionId}] Request by Admin: ${adminUserId}`);

    try {
        // 1. Parse Body
        let rawAmount: string | number | undefined | null;
        let rawPercentage: string | number | undefined | null;
        try {
            const body = await request.json();
            rawAmount = body.assignedAmount;
            rawPercentage = body.assignedPercentage;
        } catch (e) {
             return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }

        // 2. Dapatkan data UserDeduction
        const existingUserDeduction = await prisma.userDeduction.findUnique({
            where: { id: userDeductionId },
            include: { deductionType: { select: { calculationType: true, name: true } } }
        });

        // 3. Cek Eksistensi & Kepemilikan
        if (!existingUserDeduction) {
            return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId}' tidak ditemukan.` }, { status: 404 });
        }
        if (existingUserDeduction.userId !== userId) {
             return NextResponse.json({ message: `Penetapan potongan ID '${userDeductionId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
        }

        // 4. Validasi & Siapkan Data Update
        const dataToUpdate: Prisma.UserDeductionUpdateInput = {};
        const calcType = existingUserDeduction.deductionType.calculationType;

        if (calcType === DeductionCalculationType.FIXED_USER) {
            if (rawAmount === undefined) {
                 return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus disertakan untuk update.' }, { status: 400 });
            }
             if (rawAmount === null || rawAmount === '') {
                  return NextResponse.json({ message: `Jumlah Potongan (assignedAmount) wajib diisi untuk tipe ${calcType}.` }, { status: 400 });
             }
            const amountNum = Number(rawAmount);
            if (isNaN(amountNum) || amountNum < 0) { return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus angka positif.' }, { status: 400 }); }
            dataToUpdate.assignedAmount = new Prisma.Decimal(amountNum);
            dataToUpdate.assignedPercentage = null;

        } else if (calcType === DeductionCalculationType.PERCENTAGE_USER) {
             if (rawPercentage === undefined) {
                 return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus disertakan untuk update.' }, { status: 400 });
             }
            if (rawPercentage === null || rawPercentage === '') {
                 return NextResponse.json({ message: `Persentase Potongan (assignedPercentage) wajib diisi untuk tipe ${calcType}.` }, { status: 400 });
            }
            const percentNum = Number(rawPercentage);
            if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) { return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus 0-100.' }, { status: 400 }); }
            dataToUpdate.assignedPercentage = new Prisma.Decimal(percentNum);
            dataToUpdate.assignedAmount = null;

        } else {
              return NextResponse.json({ message: `Nilai untuk tipe potongan '${existingUserDeduction.deductionType.name}' (${calcType}) tidak dapat diubah di sini.` }, { status: 400 });
        }

        if (Object.keys(dataToUpdate).length === 0) {
            return NextResponse.json({ message: 'Tidak ada data valid yang dikirim untuk diperbarui.' }, { status: 400 });
        }

        // 5. Lakukan Update
        const updatedUserDeduction = await prisma.userDeduction.update({
            where: { id: userDeductionId },
            data: dataToUpdate,
            include: {
               deductionType: { select: { id: true, name: true, calculationType: true } }
            }
        });

        console.log(`Potongan (ID: ${userDeductionId}) untuk User (ID: ${userId}) diupdate oleh admin ${adminEmail} (ID: ${adminUserId})`);

        // 6. Kirim Respons Sukses
        return NextResponse.json(
            { message: 'Detail potongan berhasil diperbarui!', userDeduction: serializeUserDeduction(updatedUserDeduction) },
            { status: 200 }
        );

    // Penanganan error unknown sudah benar
    } catch (error: unknown) {
        console.error(`[API PUT /admin/users/${userId ?? 'unknown'}/deductions/${userDeductionId ?? 'unknown'}] Error:`, error);
        let errorMessage = 'Gagal memperbarui detail potongan.';
        let errorCode: string | undefined = undefined;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
           errorMessage = `Database error: ${error.message}`;
           errorCode = error.code;
           if (error.code === 'P2025') {
               errorMessage = `Penetapan potongan dengan ID '${userDeductionId ?? 'unknown'}' tidak ditemukan.`;
               return NextResponse.json({ message: errorMessage }, { status: 404 });
           }
           if (error.code === 'P2023') {
               errorMessage = 'Format ID User atau ID Potongan tidak valid.';
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
// ===      FUNGSI DELETE (Remove Deduction Assignment from User)    ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const deleteUserDeductionHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional, sebutkan kedua params
    context?: { params?: { userId?: string | string[], userDeductionId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;

    // Validasi internal userId dan userDeductionId
    const userIdParam = context?.params?.userId;
    const userDeductionIdParam = context?.params?.userDeductionId;

    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    if (typeof userDeductionIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User Deduction ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan
    const userDeductionId = userDeductionIdParam; // Aman digunakan

    console.log(`[API DELETE /admin/users/${userId}/deductions/${userDeductionId}] Request by Admin: ${adminUserId}`);

    try {
        // Hapus UserDeduction
        const deleteResult = await prisma.userDeduction.deleteMany({
            where: {
                id: userDeductionId,
                userId: userId,
            },
        });

        // Cek Hasil Delete
        if (deleteResult.count === 0) {
           const deductionExists = await prisma.userDeduction.findUnique({ where: { id: userDeductionId }, select: {userId: true} });
           if (!deductionExists) {
               return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId}' tidak ditemukan.` }, { status: 404 });
           } else { // Ada, berarti tidak cocok dengan userId
                return NextResponse.json({ message: `Penetapan potongan ID '${userDeductionId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
           }
        }

        console.log(`Potongan (ID: ${userDeductionId}) dihapus dari User (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Penetapan potongan berhasil dihapus dari pengguna.' }, { status: 200 });

    // Penanganan error unknown sudah benar
    } catch (error: unknown) {
        console.error(`[API DELETE /admin/users/${userId ?? 'unknown'}/deductions/${userDeductionId ?? 'unknown'}] Error:`, error);
        let errorMessage = 'Gagal menghapus penetapan potongan.';
        let errorCode: string | undefined = undefined;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
           errorMessage = `Database error: ${error.message}`;
           errorCode = error.code;
           if (error.code === 'P2023') {
                errorMessage = 'Format ID User atau ID Potongan tidak valid.';
                return NextResponse.json({ message: errorMessage }, { status: 400 });
           }
           // P2025 seharusnya sudah ditangani oleh cek deleteResult.count
           return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN (Perbaikan tercermin di signature handler)
export const PUT = withAuth(updateUserDeductionHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteUserDeductionHandler, Role.SUPER_ADMIN);