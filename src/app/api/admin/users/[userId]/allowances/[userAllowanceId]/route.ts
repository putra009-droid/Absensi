// src/app/api/admin/users/[userId]/allowances/[userAllowanceId]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';

// Interface untuk tipe params dinamis (setelah di-await)
interface ResolvedParams {
    userId: string;
    userAllowanceId: string;
}

// Helper function untuk serialisasi Decimal
const serializeUserAllowance = (ua: any) => ({
    ...ua,
    amount: ua.amount?.toString() ?? null,
     allowanceType: ua.allowanceType ? { // Sertakan jika ada
      id: ua.allowanceType.id,
      name: ua.allowanceType.name
    } : null,
});


// =====================================================================
// ===          FUNGSI PUT (Update Amount for User Allowance)        ===
// =====================================================================
export async function PUT(
    request: Request,
    // Deklarasi params sebagai Promise (atau biarkan Next.js handle typenya)
    { params }: { params: Promise<ResolvedParams> | ResolvedParams }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let userId: string;
  let userAllowanceId: string;

  try {
    // --- PERBAIKAN: Await params ---
    const awaitedParams = await params;
    userId = awaitedParams.userId;
    userAllowanceId = awaitedParams.userAllowanceId;
    // --- AKHIR PERBAIKAN ---

    if (!userId || !userAllowanceId) {
      return NextResponse.json({ message: 'User ID dan User Allowance ID diperlukan.' }, { status: 400 });
    }

    const body = await request.json();
    const { amount: rawAmount } = body;

    // Validasi Input Amount
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
        return NextResponse.json({ message: 'Jumlah tunjangan (amount) wajib diisi.' }, { status: 400 });
    }
    const amountNumber = Number(rawAmount);
    if (isNaN(amountNumber) || amountNumber < 0) {
      return NextResponse.json({ message: 'Jumlah tunjangan (amount) harus berupa angka positif.' }, { status: 400 });
    }
    const amountToSave = new Prisma.Decimal(amountNumber);

    // Update UserAllowance, pastikan ID dan userId sesuai
    const updateResult = await prisma.userAllowance.updateMany({
      where: {
        id: userAllowanceId,
        userId: userId,
      },
      data: {
        amount: amountToSave,
      },
    });

    if (updateResult.count === 0) {
       const allowanceExists = await prisma.userAllowance.findUnique({ where: { id: userAllowanceId } });
       if (!allowanceExists) {
           return NextResponse.json({ message: `Penetapan tunjangan dengan ID '${userAllowanceId}' tidak ditemukan.` }, { status: 404 });
       } else if (allowanceExists.userId !== userId) {
            return NextResponse.json({ message: `Penetapan tunjangan ID '${userAllowanceId}' tidak cocok dengan User ID '${userId}'.` }, { status: 400 });
       } else {
            return NextResponse.json({ message: `Gagal memperbarui tunjangan (Mungkin jumlahnya sama?).` }, { status: 404 }); // Atau 400
       }
    }

    console.log(`Tunjangan (ID: ${userAllowanceId}) untuk User (ID: ${userId}) diupdate jumlahnya oleh ${session.user.email}`);

     // Ambil data yang baru diupdate untuk response
     const updatedAllowance = await prisma.userAllowance.findUnique({
         where: { id: userAllowanceId },
         include: { allowanceType: { select: {id: true, name: true} } }
     });

    return NextResponse.json(
      { message: 'Jumlah tunjangan berhasil diperbarui!', userAllowance: updatedAllowance ? serializeUserAllowance(updatedAllowance) : null },
      { status: 200 }
    );

  } catch (error: unknown) {
    const uid = typeof userId === 'string' ? userId : 'unknown';
    const uaid = typeof userAllowanceId === 'string' ? userAllowanceId : 'unknown';
    console.error(`[API PUT /admin/users/${uid}/allowances/${uaid}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2023') { // Format ID tidak valid
         return NextResponse.json({ message: 'Format ID User atau ID Tunjangan tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
     if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memperbarui jumlah tunjangan.' }, { status: 500 });
  }
}


// =====================================================================
// ===       FUNGSI DELETE (Remove Allowance Assignment from User)   ===
// =====================================================================
export async function DELETE(
    request: Request,
    // Deklarasi params sebagai Promise (atau biarkan Next.js handle typenya)
    { params }: { params: Promise<ResolvedParams> | ResolvedParams }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let userId: string;
  let userAllowanceId: string;

  try {
    // --- PERBAIKAN: Await params ---
    const awaitedParams = await params;
    userId = awaitedParams.userId;
    userAllowanceId = awaitedParams.userAllowanceId;
    // --- AKHIR PERBAIKAN ---

    if (!userId || !userAllowanceId) {
      return NextResponse.json({ message: 'User ID dan User Allowance ID diperlukan.' }, { status: 400 });
    }

    // Hapus UserAllowance, pastikan ID dan userId sesuai
    const deleteResult = await prisma.userAllowance.deleteMany({
      where: {
        id: userAllowanceId,
        userId: userId,
      },
    });

    if (deleteResult.count === 0) {
       const allowanceExists = await prisma.userAllowance.findUnique({ where: { id: userAllowanceId } });
       if (!allowanceExists) {
           return NextResponse.json({ message: `Penetapan tunjangan dengan ID '${userAllowanceId}' tidak ditemukan.` }, { status: 404 });
       } else if (allowanceExists.userId !== userId) {
            return NextResponse.json({ message: `Penetapan tunjangan ID '${userAllowanceId}' tidak cocok dengan User ID '${userId}'.` }, { status: 400 });
       } else {
            return NextResponse.json({ message: `Gagal menghapus tunjangan (ID: ${userAllowanceId}, User: ${userId}).` }, { status: 404 }); // Atau 500
       }
    }

    console.log(`Tunjangan (ID: ${userAllowanceId}) dihapus dari User (ID: ${userId}) oleh ${session.user.email}`);
    return NextResponse.json({ message: 'Penetapan tunjangan berhasil dihapus dari pengguna.' }, { status: 200 });

  } catch (error: unknown) {
    const uid = typeof userId === 'string' ? userId : 'unknown';
    const uaid = typeof userAllowanceId === 'string' ? userAllowanceId : 'unknown';
    console.error(`[API DELETE /admin/users/${uid}/allowances/${uaid}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
       if (error.code === 'P2023') { // Format ID tidak valid
         return NextResponse.json({ message: 'Format ID User atau ID Tunjangan tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal menghapus penetapan tunjangan.' }, { status: 500 });
  }
}