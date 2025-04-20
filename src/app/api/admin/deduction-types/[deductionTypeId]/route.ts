// src/app/api/admin/deduction-types/[deductionTypeId]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client';

// Interface untuk tipe params dinamis (setelah di-await)
interface ResolvedParams {
  deductionTypeId: string;
}

// Helper function untuk serialisasi Decimal
const serializeDeductionType = (dt: any) => ({
    ...dt,
    ruleAmount: dt.ruleAmount?.toString() ?? null,
    rulePercentage: dt.rulePercentage?.toString() ?? null,
});

// =====================================================================
// ===              FUNGSI GET (Get One Deduction Type)              ===
// =====================================================================
export async function GET(
    request: Request,
    { params }: { params: Promise<ResolvedParams> | ResolvedParams }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let deductionTypeId: string;
  try {
    const awaitedParams = await params;
    deductionTypeId = awaitedParams.deductionTypeId;

    if (!deductionTypeId) {
      return NextResponse.json({ message: 'ID Jenis Potongan diperlukan.' }, { status: 400 });
    }

    const deductionType = await prisma.deductionType.findUnique({
      where: { id: deductionTypeId },
    });

    if (!deductionType) {
      return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan.` }, { status: 404 });
    }

    return NextResponse.json(serializeDeductionType(deductionType));

  } catch (error) {
     const idForLog = typeof deductionTypeId === 'string' ? deductionTypeId : 'unknown';
    console.error(`[API GET /admin/deduction-types/${idForLog}] Error:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
       return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal mengambil data jenis potongan.' }, { status: 500 });
  }
}


// =====================================================================
// ===             FUNGSI PUT (Update Deduction Type)                ===
// =====================================================================
export async function PUT(
    request: Request,
    { params }: { params: Promise<ResolvedParams> | ResolvedParams }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let deductionTypeId: string;
  try {
    const awaitedParams = await params;
    deductionTypeId = awaitedParams.deductionTypeId;

    if (!deductionTypeId) {
      return NextResponse.json({ message: 'ID Jenis Potongan diperlukan.' }, { status: 400 });
    }

    const body = await request.json();
    // Ambil semua field potensial dari body
    const { name, description, calculationType, ruleAmount: rawRuleAmount, rulePercentage: rawRulePercentage, isMandatory } = body;

    // Siapkan data yang akan diupdate (hanya field yang ada di body)
    const dataToUpdate: Prisma.DeductionTypeUpdateInput = {};

    // Validasi dan tambahkan field ke dataToUpdate jika ada di body
    if (name !== undefined) {
         if (typeof name !== 'string' || name.trim() === '') {
             return NextResponse.json({ message: 'Nama jenis potongan tidak boleh kosong jika diubah.' }, { status: 400 });
         }
         dataToUpdate.name = name.trim();
    }
    if (description !== undefined) {
         dataToUpdate.description = description || null;
    }
    if (calculationType !== undefined) {
        if (!Object.values(DeductionCalculationType).includes(calculationType as DeductionCalculationType)) {
            return NextResponse.json({ message: `Tipe Kalkulasi ('${calculationType}') tidak valid.` }, { status: 400 });
        }
         dataToUpdate.calculationType = calculationType as DeductionCalculationType;
    }
     if (isMandatory !== undefined) {
        if (typeof isMandatory !== 'boolean') {
            return NextResponse.json({ message: 'Nilai isMandatory harus boolean (true/false).' }, { status: 400 });
        }
        dataToUpdate.isMandatory = isMandatory;
    }

    // Validasi dan update ruleAmount / rulePercentage (sedikit lebih kompleks karena tergantung calculationType)
    // Ambil calculationType yang ada di DB atau yang baru diupdate untuk validasi rule
    const currentOrUpdatedCalcType = calculationType ?? (await prisma.deductionType.findUnique({ where: { id: deductionTypeId }, select: { calculationType: true } }))?.calculationType;

    if (rawRuleAmount !== undefined) {
        if (currentOrUpdatedCalcType === DeductionCalculationType.PER_LATE_INSTANCE || currentOrUpdatedCalcType === DeductionCalculationType.PER_ALPHA_DAY) {
             const amountNum = Number(rawRuleAmount);
             if (isNaN(amountNum) || amountNum < 0) {
                 return NextResponse.json({ message: 'Jumlah Aturan (ruleAmount) harus angka positif.' }, { status: 400 });
             }
             dataToUpdate.ruleAmount = new Prisma.Decimal(amountNum);
        } else {
             // Jika tipe tidak butuh ruleAmount, set jadi null atau abaikan tergantung logic bisnis
             dataToUpdate.ruleAmount = null; // Atau jangan masukkan ke dataToUpdate
        }
    }
     if (rawRulePercentage !== undefined) {
         if (currentOrUpdatedCalcType === DeductionCalculationType.PERCENTAGE_ALPHA_DAY || currentOrUpdatedCalcType === DeductionCalculationType.MANDATORY_PERCENTAGE) {
              const percentNum = Number(rawRulePercentage);
              if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) {
                  return NextResponse.json({ message: 'Persentase Aturan (rulePercentage) harus antara 0 dan 100.' }, { status: 400 });
              }
              dataToUpdate.rulePercentage = new Prisma.Decimal(percentNum);
         } else {
              dataToUpdate.rulePercentage = null; // Atau jangan masukkan ke dataToUpdate
         }
     }

    // Pastikan ada data yang diupdate
    if (Object.keys(dataToUpdate).length === 0) {
        return NextResponse.json({ message: 'Tidak ada data yang dikirim untuk diperbarui.' }, { status: 400 });
    }

    // Lakukan update
    const updatedDeductionType = await prisma.deductionType.update({
      where: { id: deductionTypeId },
      data: dataToUpdate,
    });

    console.log(`Deduction Type ${deductionTypeId} diupdate oleh ${session.user.email}:`, updatedDeductionType);
    return NextResponse.json(
      { message: 'Jenis potongan berhasil diperbarui!', deductionType: serializeDeductionType(updatedDeductionType) },
      { status: 200 }
    );

  } catch (error: unknown) {
     const idForLog = typeof deductionTypeId === 'string' ? deductionTypeId : 'unknown';
    console.error(`[API PUT /admin/deduction-types/${idForLog}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ message: `Jenis potongan dengan ID '${idForLog}' tidak ditemukan.` }, { status: 404 });
      }
      if (error.code === 'P2002' && error.meta?.target === 'DeductionType_name_key') {
         return NextResponse.json({ message: `Nama jenis potongan '${(error.meta?.modelName as any)?.name ?? ''}' sudah digunakan.` }, { status: 409 });
      }
       if (error.code === 'P2023') {
         return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
     if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal memperbarui jenis potongan.' }, { status: 500 });
  }
}


// =====================================================================
// ===            FUNGSI DELETE (Delete Deduction Type)              ===
// =====================================================================
export async function DELETE(
    request: Request,
    { params }: { params: Promise<ResolvedParams> | ResolvedParams }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  let deductionTypeId: string;
  try {
     const awaitedParams = await params;
     deductionTypeId = awaitedParams.deductionTypeId;

    if (!deductionTypeId) {
      return NextResponse.json({ message: 'ID Jenis Potongan diperlukan.' }, { status: 400 });
    }

    await prisma.deductionType.delete({
      where: { id: deductionTypeId },
    });

    console.log(`Deduction Type ${deductionTypeId} dihapus oleh ${session.user.email}`);
    return NextResponse.json({ message: 'Jenis potongan berhasil dihapus.' }, { status: 200 });

  } catch (error: unknown) {
     const idForLog = typeof deductionTypeId === 'string' ? deductionTypeId : 'unknown';
    console.error(`[API DELETE /admin/deduction-types/${idForLog}] Error:`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json({ message: `Jenis potongan dengan ID '${idForLog}' tidak ditemukan.` }, { status: 404 });
      }
      if (error.code === 'P2003') { // Foreign key constraint (masih dipakai UserDeduction)
        return NextResponse.json({ message: 'Gagal menghapus: Jenis potongan ini masih digunakan oleh satu atau lebih pengguna.' }, { status: 400 });
      }
       if (error.code === 'P2023') {
         return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal menghapus jenis potongan.' }, { status: 500 });
  }
}