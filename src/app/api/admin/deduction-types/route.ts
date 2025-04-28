// src/app/api/admin/deduction-types/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Helper function untuk serialisasi Decimal
const serializeDeductionType = (dt: any) => ({
    ...dt,
    ruleAmount: dt.ruleAmount?.toString() ?? null,
    rulePercentage: dt.rulePercentage?.toString() ?? null,
});

// =====================================================================
// ===                 FUNGSI GET (List Deduction Types)             ===
// =====================================================================
const getDeductionTypesHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id; // Admin yang request
    console.log(`[API GET /admin/deduction-types] Request by Admin: ${adminUserId}`);

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
};

// =====================================================================
// ===              FUNGSI POST (Create Deduction Type)              ===
// =====================================================================
const createDeductionTypeHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id; // Admin yang request
    const adminEmail = request.user?.email; // Untuk logging
    console.log(`[API POST /admin/deduction-types] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { name, description, calculationType, ruleAmount: rawRuleAmount, rulePercentage: rawRulePercentage, isMandatory } = body;

        // --- Validasi Input ---
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return NextResponse.json({ message: 'Nama jenis potongan wajib diisi.' }, { status: 400 });
        }
        // Cek apakah calculationType valid berdasarkan Enum
        if (!calculationType || !Object.values(DeductionCalculationType).includes(calculationType as DeductionCalculationType)) {
           return NextResponse.json({ message: `Tipe Kalkulasi ('${calculationType}') tidak valid. Pilih dari: ${Object.values(DeductionCalculationType).join(', ')}` }, { status: 400 });
        }
        if (isMandatory !== undefined && typeof isMandatory !== 'boolean') {
            return NextResponse.json({ message: 'Nilai isMandatory harus boolean (true/false).' }, { status: 400 });
        }

        let ruleAmountToSave: Prisma.Decimal | null = null;
        let rulePercentageToSave: Prisma.Decimal | null = null;

        // Validasi ruleAmount berdasarkan tipe kalkulasi
        const requiresRuleAmount: DeductionCalculationType[] = [DeductionCalculationType.PER_LATE_INSTANCE, DeductionCalculationType.PER_ALPHA_DAY];
        if (requiresRuleAmount.includes(calculationType)) {
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
        const requiresRulePercentage: DeductionCalculationType[] = [DeductionCalculationType.PERCENTAGE_ALPHA_DAY, DeductionCalculationType.MANDATORY_PERCENTAGE, DeductionCalculationType.PERCENTAGE_USER]; // Tambahkan PERCENTAGE_USER jika aturan persentase default bisa diset di sini
        if (requiresRulePercentage.includes(calculationType)) {
             if (rawRulePercentage === undefined || rawRulePercentage === null || rawRulePercentage === '') {
                 // Pengecualian: PERCENTAGE_USER boleh null di level Tipe, karena diisi di UserDeduction
                 if (calculationType !== DeductionCalculationType.PERCENTAGE_USER) {
                    return NextResponse.json({ message: `Persentase Aturan (rulePercentage) wajib diisi untuk tipe kalkulasi ${calculationType}.` }, { status: 400 });
                 }
             } else { // Jika diisi, validasi
                 const percentNum = Number(rawRulePercentage);
                 if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) { // Validasi 0-100
                      return NextResponse.json({ message: 'Persentase Aturan (rulePercentage) harus antara 0 dan 100.' }, { status: 400 });
                 }
                 rulePercentageToSave = new Prisma.Decimal(percentNum);
             }
        }
        // --- Akhir Validasi Input ---

        // Buat record baru di DB
        const newDeductionType = await prisma.deductionType.create({
            data: {
                name: name.trim(),
                description: description || null,
                calculationType: calculationType as DeductionCalculationType,
                ruleAmount: ruleAmountToSave,
                rulePercentage: rulePercentageToSave,
                isMandatory: isMandatory ?? false, // Default false jika tidak ada
            },
        });

        console.log(`Deduction Type baru (ID: ${newDeductionType.id}) ditambahkan oleh admin ${adminEmail} (ID: ${adminUserId})`);
        // Kembalikan data yang sudah diserialisasi
        return NextResponse.json(
            { message: 'Jenis potongan baru berhasil ditambahkan!', deductionType: serializeDeductionType(newDeductionType) },
            { status: 201 } // 201 Created
        );

    } catch (error: unknown) {
        console.error('[API POST /admin/deduction-types] Error:', error);
        // Tangani error Prisma (misal nama duplikat)
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('name')) { // Cek jika error pada field 'name'
                 const duplicateName = (error.meta?.modelName as any)?.name ?? ''; // Coba dapatkan nama yg duplikat (mungkin perlu penyesuaian)
                 return NextResponse.json({ message: `Nama jenis potongan '${duplicateName}' sudah digunakan.` }, { status: 409 }); // 409 Conflict
            }
            // Error Prisma lain
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        // Tangani error parsing JSON
        if (error instanceof SyntaxError) {
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Error tidak terduga lainnya
        return NextResponse.json({ message: 'Gagal menambahkan jenis potongan baru karena kesalahan server.' }, { status: 500 });
    }
};

// Bungkus kedua handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getDeductionTypesHandler, Role.SUPER_ADMIN);
export const POST = withAuth(createDeductionTypeHandler, Role.SUPER_ADMIN);