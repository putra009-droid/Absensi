// src/app/api/admin/deduction-types/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client'; // Import enum baru

// Helper function untuk serialisasi Decimal (jika ada di response list)
const serializeDeductionType = (dt: any) => ({
    ...dt,
    // Konversi Decimal ke string, biarkan null jika memang null
    ruleAmount: dt.ruleAmount?.toString() ?? null,
    rulePercentage: dt.rulePercentage?.toString() ?? null,
});

// =====================================================================
// ===                 FUNGSI GET (List Deduction Types)             ===
// =====================================================================
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  try {
    const deductionTypes = await prisma.deductionType.findMany({
      orderBy: { name: 'asc' },
    });
    // Serialisasi sebelum mengirim response
    return NextResponse.json(deductionTypes.map(serializeDeductionType));
  } catch (error) {
    console.error('[API GET /admin/deduction-types] Error:', error);
    return NextResponse.json({ message: 'Gagal mengambil daftar jenis potongan.' }, { status: 500 });
  }
}

// =====================================================================
// ===              FUNGSI POST (Create Deduction Type)              ===
// =====================================================================
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, description, calculationType, ruleAmount: rawRuleAmount, rulePercentage: rawRulePercentage, isMandatory } = body;

    // --- Validasi Input ---
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ message: 'Nama jenis potongan wajib diisi.' }, { status: 400 });
    }
    if (!calculationType || !Object.values(DeductionCalculationType).includes(calculationType as DeductionCalculationType)) {
       return NextResponse.json({ message: `Tipe Kalkulasi ('${calculationType}') tidak valid.` }, { status: 400 });
    }
    if (isMandatory !== undefined && typeof isMandatory !== 'boolean') {
        return NextResponse.json({ message: 'Nilai isMandatory harus boolean (true/false).' }, { status: 400 });
    }

    let ruleAmountToSave: Prisma.Decimal | null = null;
    let rulePercentageToSave: Prisma.Decimal | null = null;

    // Validasi ruleAmount berdasarkan tipe kalkulasi
    if (calculationType === DeductionCalculationType.PER_LATE_INSTANCE || calculationType === DeductionCalculationType.PER_ALPHA_DAY) {
         if (rawRuleAmount === undefined || rawRuleAmount === null || rawRuleAmount === '') {
             return NextResponse.json({ message: `Jumlah Aturan (ruleAmount) wajib diisi untuk tipe kalkulasi ${calculationType}.` }, { status: 400 });
         }
         const amountNum = Number(rawRuleAmount);
         if (isNaN(amountNum) || amountNum < 0) {
             return NextResponse.json({ message: 'Jumlah Aturan (ruleAmount) harus angka positif.' }, { status: 400 });
         }
         ruleAmountToSave = new Prisma.Decimal(amountNum);
    }

    // Validasi rulePercentage berdasarkan tipe kalkulasi
    if (calculationType === DeductionCalculationType.PERCENTAGE_ALPHA_DAY || calculationType === DeductionCalculationType.MANDATORY_PERCENTAGE) {
         if (rawRulePercentage === undefined || rawRulePercentage === null || rawRulePercentage === '') {
             return NextResponse.json({ message: `Persentase Aturan (rulePercentage) wajib diisi untuk tipe kalkulasi ${calculationType}.` }, { status: 400 });
         }
         const percentNum = Number(rawRulePercentage);
          // Validasi persentase (misal: 0-100)
         if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) {
              return NextResponse.json({ message: 'Persentase Aturan (rulePercentage) harus antara 0 dan 100.' }, { status: 400 });
         }
         rulePercentageToSave = new Prisma.Decimal(percentNum);
    }
    // --- Akhir Validasi Input ---


    const newDeductionType = await prisma.deductionType.create({
      data: {
        name: name.trim(),
        description: description || null,
        calculationType: calculationType as DeductionCalculationType, // Pastikan tipenya sesuai enum
        ruleAmount: ruleAmountToSave,
        rulePercentage: rulePercentageToSave,
        isMandatory: isMandatory ?? false, // Default false jika tidak ada
      },
    });

    console.log(`Deduction Type baru ditambahkan oleh ${session.user.email}:`, newDeductionType);
    return NextResponse.json(
      { message: 'Jenis potongan baru berhasil ditambahkan!', deductionType: serializeDeductionType(newDeductionType) },
      { status: 201 }
    );

  } catch (error: unknown) {
    console.error('[API POST /admin/deduction-types] Error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002' && error.meta?.target === 'DeductionType_name_key') {
         return NextResponse.json({ message: `Nama jenis potongan '${(error.meta?.modelName as any)?.name ?? ''}' sudah digunakan.` }, { status: 409 });
      }
      return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
    }
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Gagal menambahkan jenis potongan baru.' }, { status: 500 });
  }
}