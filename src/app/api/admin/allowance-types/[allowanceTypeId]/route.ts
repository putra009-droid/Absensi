// src/app/api/admin/allowance-types/[allowanceTypeId]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';

// Interface untuk tipe params dinamis
interface RouteParams {
  params: { allowanceTypeId: string };
}

// =====================================================================
// ===              FUNGSI GET (Get One Allowance Type)              ===
// =====================================================================
export async function GET(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  const { allowanceTypeId } = params;
  if (!allowanceTypeId) {
    return NextResponse.json({ message: 'ID Jenis Tunjangan diperlukan.' }, { status: 400 });
  }

  try {
    const allowanceType = await prisma.allowanceType.findUnique({
      where: { id: allowanceTypeId },
    });

    if (!allowanceType) {
      return NextResponse.json({ message: `Jenis tunjangan dengan ID '${allowanceTypeId}' tidak ditemukan.` }, { status: 404 });
    }

    return NextResponse.json(allowanceType);

  } catch (error) {
    console.error(`[API GET /admin/allowance-types/${allowanceTypeId}] Error:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
       return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal mengambil data jenis tunjangan.' }, { status: 500 });
  }
}


// =====================================================================
// ===             FUNGSI PUT (Update Allowance Type)                ===
// =====================================================================
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  const { allowanceTypeId } = params;
  if (!allowanceTypeId) {
    return NextResponse.json({ message: 'ID Jenis Tunjangan diperlukan.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, description, isFixed } = body;

    // Validasi Input (Mirip dengan POST, tapi semua opsional kecuali setidaknya satu field ada)
    if (!name && description === undefined && isFixed === undefined) {
        return NextResponse.json({ message: 'Tidak ada data yang dikirim untuk diperbarui.' }, { status: 400 });
    }
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return NextResponse.json({ message: 'Nama jenis tunjangan tidak boleh kosong jika diubah.' }, { status: 400 });
    }
    if (isFixed !== undefined && typeof isFixed !== 'boolean') {
       return NextResponse.json({ message: 'Nilai isFixed harus boolean (true/false) jika diubah.' }, { status: 400 });
    }

    // Siapkan data yang akan diupdate (hanya field yang ada di body)
    const dataToUpdate: Prisma.AllowanceTypeUpdateInput = {};
    if (name) dataToUpdate.name = name.trim();
    if (description !== undefined) dataToUpdate.description = description || null;
    if (isFixed !== undefined) dataToUpdate.isFixed = isFixed;

    const updatedAllowanceType = await prisma.allowanceType.update({
      where: { id: allowanceTypeId },
      data: dataToUpdate,
    });

    console.log(`Allowance Type ${allowanceTypeId} diupdate oleh ${session.user.email}:`, updatedAllowanceType);
    return NextResponse.json(
      { message: 'Jenis tunjangan berhasil diperbarui!', allowanceType: updatedAllowanceType },
      { status: 200 }
    );

  } catch (error: unknown) {
     const idForLog = allowanceTypeId || 'unknown';
    console.error(`[API PUT /admin/allowance-types/${idForLog}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // Gagal update karena record tidak ditemukan
        return NextResponse.json({ message: `Jenis tunjangan dengan ID '${idForLog}' tidak ditemukan.` }, { status: 404 });
      }
      if (error.code === 'P2002' && error.meta?.target === 'AllowanceType_name_key') { // Nama duplikat
         return NextResponse.json({ message: `Nama jenis tunjangan '${(error.meta?.modelName as any)?.name ?? ''}' sudah digunakan.` }, { status: 409 });
      }
       if (error.code === 'P2023') { // Format ID tidak valid
         return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
     if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memperbarui jenis tunjangan.' }, { status: 500 });
  }
}


// =====================================================================
// ===            FUNGSI DELETE (Delete Allowance Type)              ===
// =====================================================================
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  const { allowanceTypeId } = params;
  if (!allowanceTypeId) {
    return NextResponse.json({ message: 'ID Jenis Tunjangan diperlukan.' }, { status: 400 });
  }

  try {
    await prisma.allowanceType.delete({
      where: { id: allowanceTypeId },
    });

    console.log(`Allowance Type ${allowanceTypeId} dihapus oleh ${session.user.email}`);
    // Bisa return 204 No Content atau 200 OK dengan pesan
    return NextResponse.json({ message: 'Jenis tunjangan berhasil dihapus.' }, { status: 200 });
    // return new Response(null, { status: 204 }); // Alternatif 204 No Content

  } catch (error: unknown) {
    const idForLog = allowanceTypeId || 'unknown';
    console.error(`[API DELETE /admin/allowance-types/${idForLog}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { // Record tidak ditemukan
        return NextResponse.json({ message: `Jenis tunjangan dengan ID '${idForLog}' tidak ditemukan.` }, { status: 404 });
      }
      if (error.code === 'P2003') { // Foreign key constraint violation (masih dipakai di UserAllowance)
        return NextResponse.json({ message: 'Gagal menghapus: Jenis tunjangan ini masih digunakan oleh satu atau lebih pengguna.' }, { status: 400 }); // Bad Request
      }
       if (error.code === 'P2023') { // Format ID tidak valid
         return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal menghapus jenis tunjangan.' }, { status: 500 });
  }
}