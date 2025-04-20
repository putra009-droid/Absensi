// src/app/api/admin/users/[userId]/deductions/[userDeductionId]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client';

// Interface untuk tipe params dinamis
interface ResolvedParamsPutDelete {
    userId: string;
    userDeductionId: string;
}

// Helper function untuk serialisasi UserDeduction
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
// ===          FUNGSI PUT (Update Amount/Percentage for User Deduction) ===
// =====================================================================
export async function PUT(
    request: Request,
    { params }: { params: Promise<ResolvedParamsPutDelete> | ResolvedParamsPutDelete }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let userId: string;
  let userDeductionId: string;

  try {
    const awaitedParams = await params;
    userId = awaitedParams.userId;
    userDeductionId = awaitedParams.userDeductionId;

    if (!userId || !userDeductionId) {
      return NextResponse.json({ message: 'User ID dan User Deduction ID diperlukan.' }, { status: 400 });
    }

    const body = await request.json();
    const { assignedAmount: rawAmount, assignedPercentage: rawPercentage } = body;

    // 1. Dapatkan data UserDeduction yang akan diupdate + tipe potongannya
    const existingUserDeduction = await prisma.userDeduction.findUnique({
        where: { id: userDeductionId },
        include: { deductionType: { select: { calculationType: true, name: true } } } // Ambil tipe kalkulasinya
    });

    // 2. Cek Eksistensi & Kepemilikan
    if (!existingUserDeduction) {
        return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId}' tidak ditemukan.` }, { status: 404 });
    }
    if (existingUserDeduction.userId !== userId) {
         return NextResponse.json({ message: `Penetapan potongan ID '${userDeductionId}' tidak cocok dengan User ID '${userId}'.` }, { status: 400 });
    }

    // 3. Validasi dan Siapkan Data Update berdasarkan Tipe Kalkulasi
    const dataToUpdate: Prisma.UserDeductionUpdateInput = {};
    const calcType = existingUserDeduction.deductionType.calculationType;

    if (calcType === DeductionCalculationType.FIXED_USER) {
         if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
            return NextResponse.json({ message: `Jumlah Potongan (assignedAmount) wajib diisi untuk tipe ${calcType}.` }, { status: 400 });
         }
         const amountNum = Number(rawAmount);
         if (isNaN(amountNum) || amountNum < 0) {
             return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus angka positif.' }, { status: 400 });
         }
         dataToUpdate.assignedAmount = new Prisma.Decimal(amountNum);
         dataToUpdate.assignedPercentage = null; // Reset percentage jika ada

    } else if (calcType === DeductionCalculationType.PERCENTAGE_USER) {
        if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') {
            return NextResponse.json({ message: `Persentase Potongan (assignedPercentage) wajib diisi untuk tipe ${calcType}.` }, { status: 400 });
        }
         const percentNum = Number(rawPercentage);
         if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) {
             return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus antara 0 dan 100.' }, { status: 400 });
         }
         dataToUpdate.assignedPercentage = new Prisma.Decimal(percentNum);
          dataToUpdate.assignedAmount = null; // Reset amount jika ada

    } else {
         // Tipe lain tidak seharusnya diedit nilainya di sini
          return NextResponse.json({ message: `Nilai untuk tipe potongan '${existingUserDeduction.deductionType.name}' (${calcType}) tidak dapat diubah di sini.` }, { status: 400 });
    }

    // Pastikan ada data yang diupdate (sebenarnya validasi di atas sudah memastikan salah satu ada)
    if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ message: 'Tidak ada data valid yang dikirim untuk diperbarui.' }, { status: 400 });
    }

    // 4. Lakukan Update (gunakan update, bukan updateMany karena kita sudah cek detail)
    const updatedUserDeduction = await prisma.userDeduction.update({
      where: { id: userDeductionId },
      data: dataToUpdate,
       include: { // Include lagi untuk response
         deductionType: { select: { id: true, name: true, calculationType: true } }
      }
    });

    console.log(`Potongan (ID: ${userDeductionId}) untuk User (ID: ${userId}) diupdate oleh ${session.user.email}`);

    return NextResponse.json(
      { message: 'Detail potongan berhasil diperbarui!', userDeduction: serializeUserDeduction(updatedUserDeduction) },
      { status: 200 }
    );

  } catch (error: unknown) {
    const uid = typeof userId === 'string' ? userId : 'unknown';
    const udid = typeof userDeductionId === 'string' ? userDeductionId : 'unknown';
    console.error(`[API PUT /admin/users/${uid}/deductions/${udid}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2025') { // Gagal update karena record tidak ditemukan
            return NextResponse.json({ message: `Penetapan potongan dengan ID '${udid}' tidak ditemukan.` }, { status: 404 });
       }
       if (error.code === 'P2023') {
         return NextResponse.json({ message: 'Format ID User atau ID Potongan tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
     if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memperbarui detail potongan.' }, { status: 500 });
  }
}


// =====================================================================
// ===       FUNGSI DELETE (Remove Deduction Assignment from User)   ===
// =====================================================================
export async function DELETE(
    request: Request,
    { params }: { params: Promise<ResolvedParamsPutDelete> | ResolvedParamsPutDelete }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let userId: string;
  let userDeductionId: string;

  try {
    const awaitedParams = await params;
    userId = awaitedParams.userId;
    userDeductionId = awaitedParams.userDeductionId;

    if (!userId || !userDeductionId) {
      return NextResponse.json({ message: 'User ID dan User Deduction ID diperlukan.' }, { status: 400 });
    }

    // Hapus UserDeduction, pastikan ID dan userId sesuai
    const deleteResult = await prisma.userDeduction.deleteMany({
      where: {
        id: userDeductionId,
        userId: userId, // Pastikan hanya menghapus milik user yg benar
      },
    });

    if (deleteResult.count === 0) {
       // Cek apakah ID-nya ada tapi bukan milik user ini, atau ID-nya memang tidak ada
       const deductionExists = await prisma.userDeduction.findUnique({ where: { id: userDeductionId } });
       if (!deductionExists) {
           return NextResponse.json({ message: `Penetapan potongan dengan ID '${userDeductionId}' tidak ditemukan.` }, { status: 404 });
       } else { // Ada, berarti tidak cocok dengan userId
            return NextResponse.json({ message: `Penetapan potongan ID '${userDeductionId}' tidak cocok dengan User ID '${userId}'.` }, { status: 400 });
       }
    }

    console.log(`Potongan (ID: ${userDeductionId}) dihapus dari User (ID: ${userId}) oleh ${session.user.email}`);
    return NextResponse.json({ message: 'Penetapan potongan berhasil dihapus dari pengguna.' }, { status: 200 });

  } catch (error: unknown) {
    const uid = typeof userId === 'string' ? userId : 'unknown';
    const udid = typeof userDeductionId === 'string' ? userDeductionId : 'unknown';
    console.error(`[API DELETE /admin/users/${uid}/deductions/${udid}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2023') {
         return NextResponse.json({ message: 'Format ID User atau ID Potongan tidak valid.' }, { status: 400 });
      }
       // P2025 seharusnya sudah ditangani oleh cek deleteResult.count
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal menghapus penetapan potongan.' }, { status: 500 });
  }
}