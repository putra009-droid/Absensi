// src/app/api/admin/users/[userId]/deductions/[userDeductionId]/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface untuk menangkap parameter dinamis dari context
interface RouteContext {
    params: {
        userId: string;
        userDeductionId: string;
    };
}

// Helper function untuk serialisasi UserDeduction
const serializeUserDeduction = (ud: any) => ({
    ...ud,
    assignedAmount: ud.assignedAmount?.toString() ?? null,
    assignedPercentage: ud.assignedPercentage?.toString() ?? null,
    deductionType: ud.deductionType ? { // Sertakan jika di-include
      id: ud.deductionType.id,
      name: ud.deductionType.name,
      calculationType: ud.deductionType.calculationType,
    } : null,
});


// =====================================================================
// ===        FUNGSI PUT (Update Amount/Percentage for User Deduction) ===
// =====================================================================
const updateUserDeductionHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id; // Admin yang request
    const adminEmail = request.user?.email; // Untuk logging
    const userId = context?.params?.userId; // Ambil dari context
    const userDeductionId = context?.params?.userDeductionId; // Ambil dari context

    if (!userId || !userDeductionId) {
        return NextResponse.json({ message: 'User ID dan User Deduction ID diperlukan di URL path.' }, { status: 400 });
    }
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


        // 2. Dapatkan data UserDeduction yang akan diupdate + tipe potongannya
        const existingUserDeduction = await prisma.userDeduction.findUnique({
            where: { id: userDeductionId },
            include: { deductionType: { select: { calculationType: true, name: true } } } // Ambil tipe kalkulasinya
        });

        // 3. Cek Eksistensi & Kepemilikan
        if (!existingUserDeduction) {
            return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId}' tidak ditemukan.` }, { status: 404 });
        }
        if (existingUserDeduction.userId !== userId) {
             return NextResponse.json({ message: `Penetapan potongan ID '${userDeductionId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
        }

        // 4. Validasi dan Siapkan Data Update berdasarkan Tipe Kalkulasi
        const dataToUpdate: Prisma.UserDeductionUpdateInput = {};
        const calcType = existingUserDeduction.deductionType.calculationType;

        if (calcType === DeductionCalculationType.FIXED_USER) {
            if (rawAmount === undefined) { // Hanya validasi jika field amount dikirim
                 return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus disertakan untuk update.' }, { status: 400 });
            }
             if (rawAmount === null || rawAmount === '') { // Izinkan set ke null/kosong untuk menghapus amount? Tergantung aturan bisnis. Asumsi Wajib jika tipe FIXED_USER.
                  return NextResponse.json({ message: `Jumlah Potongan (assignedAmount) wajib diisi untuk tipe ${calcType}.` }, { status: 400 });
             }
            const amountNum = Number(rawAmount);
            if (isNaN(amountNum) || amountNum < 0) { return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus angka positif.' }, { status: 400 }); }
            dataToUpdate.assignedAmount = new Prisma.Decimal(amountNum);
            dataToUpdate.assignedPercentage = null; // Reset percentage

        } else if (calcType === DeductionCalculationType.PERCENTAGE_USER) {
             if (rawPercentage === undefined) { // Hanya validasi jika field percentage dikirim
                 return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus disertakan untuk update.' }, { status: 400 });
             }
            if (rawPercentage === null || rawPercentage === '') { // Izinkan set ke null? Asumsi Wajib jika tipe PERCENTAGE_USER.
                 return NextResponse.json({ message: `Persentase Potongan (assignedPercentage) wajib diisi untuk tipe ${calcType}.` }, { status: 400 });
            }
            const percentNum = Number(rawPercentage);
            if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) { return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus 0-100.' }, { status: 400 }); }
            dataToUpdate.assignedPercentage = new Prisma.Decimal(percentNum);
            dataToUpdate.assignedAmount = null; // Reset amount

        } else {
             // Tipe lain tidak bisa diupdate nilainya di sini
              return NextResponse.json({ message: `Nilai untuk tipe potongan '${existingUserDeduction.deductionType.name}' (${calcType}) tidak dapat diubah di sini.` }, { status: 400 });
        }

        // Pastikan ada data yang diupdate (seharusnya sudah tervalidasi)
        if (Object.keys(dataToUpdate).length === 0) {
             // Ini seharusnya tidak terjadi jika validasi di atas benar
            return NextResponse.json({ message: 'Tidak ada data valid yang dikirim untuk diperbarui.' }, { status: 400 });
        }

        // 5. Lakukan Update
        const updatedUserDeduction = await prisma.userDeduction.update({
            where: { id: userDeductionId },
            data: dataToUpdate,
            include: { // Include lagi untuk response
               deductionType: { select: { id: true, name: true, calculationType: true } }
            }
        });

        console.log(`Potongan (ID: ${userDeductionId}) untuk User (ID: ${userId}) diupdate oleh admin ${adminEmail} (ID: ${adminUserId})`);

        // 6. Kirim Respons Sukses
        return NextResponse.json(
            { message: 'Detail potongan berhasil diperbarui!', userDeduction: serializeUserDeduction(updatedUserDeduction) },
            { status: 200 }
        );

    } catch (error: unknown) {
        console.error(`[API PUT /admin/users/${userId ?? 'unknown'}/deductions/${userDeductionId ?? 'unknown'}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
           if (error.code === 'P2025') { return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId ?? 'unknown'}' tidak ditemukan.` }, { status: 404 }); }
           if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID User atau ID Potongan tidak valid.' }, { status: 400 }); }
           return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        if (error instanceof SyntaxError) { return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 }); }
        return NextResponse.json({ message: 'Gagal memperbarui detail potongan.' }, { status: 500 });
    }
};


// =====================================================================
// ===      FUNGSI DELETE (Remove Deduction Assignment from User)    ===
// =====================================================================
const deleteUserDeductionHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // Untuk logging
    const userId = context?.params?.userId;
    const userDeductionId = context?.params?.userDeductionId;

    if (!userId || !userDeductionId) {
        return NextResponse.json({ message: 'User ID dan User Deduction ID diperlukan di URL path.' }, { status: 400 });
    }
     console.log(`[API DELETE /admin/users/${userId}/deductions/${userDeductionId}] Request by Admin: ${adminUserId}`);

    try {
        // Hapus UserDeduction, pastikan ID dan userId sesuai
        const deleteResult = await prisma.userDeduction.deleteMany({
            where: {
                id: userDeductionId,
                userId: userId, // Pastikan hanya menghapus milik user yg benar
            },
        });

        // Cek Hasil Delete
        if (deleteResult.count === 0) {
           // Cek apakah ID-nya ada tapi bukan milik user ini, atau ID-nya memang tidak ada
           const deductionExists = await prisma.userDeduction.findUnique({ where: { id: userDeductionId }, select: {userId: true} });
           if (!deductionExists) {
               return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId}' tidak ditemukan.` }, { status: 404 });
           } else { // Ada, berarti tidak cocok dengan userId
                return NextResponse.json({ message: `Penetapan potongan ID '${userDeductionId}' tidak cocok dengan User ID '${userId}' di URL.` }, { status: 400 });
           }
        }

        console.log(`Potongan (ID: ${userDeductionId}) dihapus dari User (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Penetapan potongan berhasil dihapus dari pengguna.' }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API DELETE /admin/users/${userId ?? 'unknown'}/deductions/${userDeductionId ?? 'unknown'}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
           if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID User atau ID Potongan tidak valid.' }, { status: 400 }); }
           // P2025 seharusnya sudah ditangani oleh cek deleteResult.count
           return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        // Error umum
        return NextResponse.json({ message: 'Gagal menghapus penetapan potongan.' }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN
export const PUT = withAuth(updateUserDeductionHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteUserDeductionHandler, Role.SUPER_ADMIN);

// GET detail spesifik UserDeduction biasanya tidak perlu, sudah ada di list user