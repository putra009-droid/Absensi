// src/app/api/admin/allowance-types/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';

// =====================================================================
// ===                 FUNGSI GET (List Allowance Types)             ===
// =====================================================================
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  // Hanya SUPER_ADMIN yang bisa melihat daftar jenis tunjangan
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak. Memerlukan hak akses Super Admin.' }, { status: 403 });
  }

  try {
    const allowanceTypes = await prisma.allowanceType.findMany({
      orderBy: { name: 'asc' }, // Urutkan berdasarkan nama
    });
    return NextResponse.json(allowanceTypes);
  } catch (error) {
    console.error('[API GET /admin/allowance-types] Error:', error);
    return NextResponse.json({ message: 'Gagal mengambil daftar jenis tunjangan.' }, { status: 500 });
  }
}

// =====================================================================
// ===              FUNGSI POST (Create Allowance Type)              ===
// =====================================================================
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  // Hanya SUPER_ADMIN yang bisa membuat jenis tunjangan
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak. Memerlukan hak akses Super Admin.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, description, isFixed } = body;

    // Validasi Input
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ message: 'Nama jenis tunjangan wajib diisi.' }, { status: 400 });
    }
    if (typeof isFixed !== 'boolean' && isFixed !== undefined) { // isFixed opsional, default true
       return NextResponse.json({ message: 'Nilai isFixed harus boolean (true/false).' }, { status: 400 });
    }

    const newAllowanceType = await prisma.allowanceType.create({
      data: {
        name: name.trim(),
        description: description || null, // Simpan null jika kosong
        isFixed: isFixed === undefined ? true : isFixed, // Default true jika tidak disediakan
      },
    });

    console.log(`Allowance Type baru ditambahkan oleh ${session.user.email}:`, newAllowanceType);
    return NextResponse.json(
      { message: 'Jenis tunjangan baru berhasil ditambahkan!', allowanceType: newAllowanceType },
      { status: 201 } // 201 Created
    );

  } catch (error: unknown) {
    console.error('[API POST /admin/allowance-types] Error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle error jika nama sudah ada (unique constraint violation)
      if (error.code === 'P2002' && error.meta?.target === 'AllowanceType_name_key') {
         // Pesan error spesifik untuk field 'name'
         return NextResponse.json({ message: `Nama jenis tunjangan '${(error.meta?.modelName as any)?.name ?? ''}' sudah digunakan.` }, { status: 409 }); // 409 Conflict
      }
      // Error Prisma lainnya
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
    if (error instanceof SyntaxError) { // Error jika JSON body tidak valid
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    // Error umum lainnya
    return NextResponse.json({ message: 'Gagal menambahkan jenis tunjangan baru.' }, { status: 500 });
  }
}