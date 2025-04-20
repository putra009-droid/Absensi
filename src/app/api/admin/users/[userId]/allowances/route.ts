// src/app/api/admin/users/[userId]/allowances/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';

// Interface untuk tipe params dinamis (setelah di-await)
interface ResolvedParams {
  userId: string;
}

// Helper function untuk serialisasi Decimal
const serializeUserAllowance = (ua: any) => ({
    ...ua,
    amount: ua.amount?.toString() ?? null,
    allowanceType: ua.allowanceType ? {
      id: ua.allowanceType.id,
      name: ua.allowanceType.name,
      description: ua.allowanceType.description, // Sertakan jika perlu
      isFixed: ua.allowanceType.isFixed,         // Sertakan jika perlu
    } : null,
});

// =====================================================================
// ===      FUNGSI GET (List Allowances for a specific User)         ===
// =====================================================================
export async function GET(
    request: Request,
    // Deklarasi params sebagai Promise (atau biarkan Next.js handle typenya)
    { params }: { params: Promise<ResolvedParams> | ResolvedParams } // Bisa Promise atau sudah resolve
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let userId: string;
  try {
    // --- PERBAIKAN: Await params ---
    const awaitedParams = await params;
    userId = awaitedParams.userId;
    // --- AKHIR PERBAIKAN ---

    if (!userId) {
      return NextResponse.json({ message: 'User ID diperlukan.' }, { status: 400 });
    }

    // Ambil semua UserAllowance untuk userId tertentu
    const userAllowances = await prisma.userAllowance.findMany({
      where: { userId: userId },
      include: {
        allowanceType: {
          select: {
            id: true,
            name: true,
            description: true,
            isFixed: true,
          }
        }
      },
      orderBy: {
        allowanceType: { name: 'asc' }
      }
    });

    if (userAllowances.length === 0) {
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
        }
    }

    const serializedAllowances = userAllowances.map(serializeUserAllowance);
    return NextResponse.json(serializedAllowances);

  } catch (error) {
    const idForLog = typeof userId === 'string' ? userId : 'unknown'; // Gunakan userId jika sudah didapat
    console.error(`[API GET /admin/users/${idForLog}/allowances] Error:`, error);
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
       return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal mengambil data tunjangan pengguna.' }, { status: 500 });
  }
}


// =====================================================================
// === FUNGSI POST (Assign/Create Allowance for a specific User)     ===
// =====================================================================
export async function POST(
    request: Request,
    // Deklarasi params sebagai Promise (atau biarkan Next.js handle typenya)
    { params }: { params: Promise<ResolvedParams> | ResolvedParams }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let userId: string;
  try {
     // --- PERBAIKAN: Await params ---
     const awaitedParams = await params;
     userId = awaitedParams.userId;
     // --- AKHIR PERBAIKAN ---

    if (!userId) {
      return NextResponse.json({ message: 'User ID diperlukan.' }, { status: 400 });
    }

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

    // Cek user dan allowance type (opsional tapi bagus)
    const [userExists, allowanceTypeExists] = await Promise.all([
         prisma.user.findUnique({ where: { id: userId }, select: { email: true} }), // Hanya select email
         prisma.allowanceType.findUnique({ where: { id: allowanceTypeId }, select: { name: true} }) // Hanya select name
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

    console.log(`Tunjangan ${allowanceTypeExists.name} ditambahkan untuk user ${userExists.email} oleh ${session.user.email}`);

    return NextResponse.json(
      { message: 'Tunjangan berhasil ditambahkan untuk pengguna!', userAllowance: serializeUserAllowance(newUserAllowance) },
      { status: 201 }
    );

  } catch (error: unknown) {
    const idForLog = typeof userId === 'string' ? userId : 'unknown';
    console.error(`[API POST /admin/users/${idForLog}/allowances] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002' && error.meta?.target === 'UserAllowance_userId_allowanceTypeId_key') {
        return NextResponse.json({ message: 'Jenis tunjangan ini sudah ditambahkan untuk pengguna tersebut.' }, { status: 409 });
      }
      if (error.code === 'P2003') {
         // Error ini bisa terjadi jika userId atau allowanceTypeId tidak ada saat create
         // Seharusnya sudah ditangani cek di atas, tapi sebagai fallback
         return NextResponse.json({ message: 'Referensi User atau Jenis Tunjangan tidak valid saat membuat data.'}, { status: 400 });
      }
       if (error.code === 'P2023') { // Format ID tidak valid
         return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
     if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal menambahkan tunjangan untuk pengguna.' }, { status: 500 });
  }
}