// src/app/api/admin/deduction-types/[deductionTypeId]/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface untuk menangkap parameter dinamis dari context
interface RouteContext {
    params: { deductionTypeId: string };
}

// Helper function untuk serialisasi Decimal
const serializeDeductionType = (dt: any) => ({
    ...dt,
    ruleAmount: dt.ruleAmount?.toString() ?? null,
    rulePercentage: dt.rulePercentage?.toString() ?? null,
});

// =====================================================================
// ===           FUNGSI GET (Get One Deduction Type by ID)           ===
// =====================================================================
const getDeductionTypeHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id; // Admin yang request
    const deductionTypeId = context?.params?.deductionTypeId; // Ambil ID dari context

    if (!deductionTypeId) {
        return NextResponse.json({ message: 'ID Jenis Potongan diperlukan di URL.' }, { status: 400 });
    }
    console.log(`[API GET /admin/deduction-types/${deductionTypeId}] Request by Admin: ${adminUserId}`);

    try {
        const deductionType = await prisma.deductionType.findUnique({
            where: { id: deductionTypeId },
        });

        if (!deductionType) {
            return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan.` }, { status: 404 });
        }

        // Gunakan helper serialisasi
        return NextResponse.json(serializeDeductionType(deductionType));

    } catch (error) {
        console.error(`[API GET /admin/deduction-types/${deductionTypeId}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
             if (error.code === 'P2023') { // Invalid ID format
               return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
            }
             // Handle error prisma lain jika perlu
             return NextResponse.json({ message: `Database error: ${error.message}`}, { status: 500 });
        }
        // Error umum
        return NextResponse.json({ message: 'Gagal mengambil data jenis potongan.' }, { status: 500 });
    }
};

// =====================================================================
// ===           FUNGSI PUT (Update Deduction Type by ID)            ===
// =====================================================================
const updateDeductionTypeHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // Untuk logging
    const deductionTypeId = context?.params?.deductionTypeId;

    if (!deductionTypeId) {
        return NextResponse.json({ message: 'ID Jenis Potongan diperlukan di URL.' }, { status: 400 });
    }
     console.log(`[API PUT /admin/deduction-types/${deductionTypeId}] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { name, description, calculationType, ruleAmount: rawRuleAmount, rulePercentage: rawRulePercentage, isMandatory } = body;

        // Siapkan data update
        const dataToUpdate: Prisma.DeductionTypeUpdateInput = {};

        // Validasi sama seperti di kode asli Anda...
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') { return NextResponse.json({ message: 'Nama tidak boleh kosong jika diubah.' }, { status: 400 }); }
            dataToUpdate.name = name.trim();
        }
        if (description !== undefined) {
            dataToUpdate.description = description || null;
        }
        if (calculationType !== undefined) {
            if (!Object.values(DeductionCalculationType).includes(calculationType as DeductionCalculationType)) { return NextResponse.json({ message: `Tipe Kalkulasi ('${calculationType}') tidak valid.` }, { status: 400 }); }
            dataToUpdate.calculationType = calculationType as DeductionCalculationType;
        }
        if (isMandatory !== undefined) {
            if (typeof isMandatory !== 'boolean') { return NextResponse.json({ message: 'Nilai isMandatory harus boolean.' }, { status: 400 }); }
            dataToUpdate.isMandatory = isMandatory;
        }

        // Validasi ruleAmount / rulePercentage (perlu ambil tipe kalkulasi terbaru)
        // Ambil tipe kalkulasi saat ini atau yang baru dari body request
        const currentTypeRecord = await prisma.deductionType.findUnique({ where: { id: deductionTypeId }, select: { calculationType: true } });
        if (!currentTypeRecord && !calculationType) {
             // Ini seharusnya tidak terjadi jika PUT dipanggil setelah GET, tapi sebagai pengaman
              return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan untuk validasi tipe.` }, { status: 404 });
        }
        const typeForValidation = calculationType ?? currentTypeRecord?.calculationType;

         // Validasi & konversi ruleAmount
         const requiresRuleAmount: DeductionCalculationType[] = [DeductionCalculationType.PER_LATE_INSTANCE, DeductionCalculationType.PER_ALPHA_DAY];
         if (rawRuleAmount !== undefined) {
             if (requiresRuleAmount.includes(typeForValidation as DeductionCalculationType)) {
                 const amountNum = Number(rawRuleAmount);
                 if (isNaN(amountNum) || amountNum < 0) { return NextResponse.json({ message: 'Jumlah Aturan (ruleAmount) harus angka positif.' }, { status: 400 }); }
                 dataToUpdate.ruleAmount = new Prisma.Decimal(amountNum);
             } else {
                  dataToUpdate.ruleAmount = null; // Set null jika tipe tidak memerlukan
             }
         }

         // Validasi & konversi rulePercentage
          const requiresRulePercentage: DeductionCalculationType[] = [DeductionCalculationType.PERCENTAGE_ALPHA_DAY, DeductionCalculationType.MANDATORY_PERCENTAGE]; // PERCENTAGE_USER tidak divalidasi di sini
         if (rawRulePercentage !== undefined) {
             if (requiresRulePercentage.includes(typeForValidation as DeductionCalculationType)) {
                 const percentNum = Number(rawRulePercentage);
                 if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) { return NextResponse.json({ message: 'Persentase Aturan (rulePercentage) harus 0-100.' }, { status: 400 }); }
                 dataToUpdate.rulePercentage = new Prisma.Decimal(percentNum);
             } else {
                  dataToUpdate.rulePercentage = null; // Set null jika tipe tidak memerlukan
             }
         }

        // Pastikan ada data yang diupdate
        if (Object.keys(dataToUpdate).length === 0) {
            return NextResponse.json({ message: 'Tidak ada data valid yang dikirim untuk diperbarui.' }, { status: 400 });
        }

        // Lakukan update
        const updatedDeductionType = await prisma.deductionType.update({
            where: { id: deductionTypeId },
            data: dataToUpdate,
        });

        console.log(`Deduction Type ${deductionTypeId} diupdate oleh admin ${adminEmail} (ID: ${adminUserId}):`, updatedDeductionType);
        return NextResponse.json(
            { message: 'Jenis potongan berhasil diperbarui!', deductionType: serializeDeductionType(updatedDeductionType) },
            { status: 200 }
        );

    } catch (error: unknown) {
        console.error(`[API PUT /admin/deduction-types/${deductionTypeId ?? 'unknown'}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') { return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan.` }, { status: 404 }); }
            if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('name')) { return NextResponse.json({ message: `Nama jenis potongan sudah digunakan.` }, { status: 409 });}
            if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 }); }
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        if (error instanceof SyntaxError) { return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 }); }
        return NextResponse.json({ message: 'Gagal memperbarui jenis potongan.' }, { status: 500 });
    }
};

// =====================================================================
// ===         FUNGSI DELETE (Delete Deduction Type by ID)           ===
// =====================================================================
const deleteDeductionTypeHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
     const adminUserId = request.user?.id;
     const adminEmail = request.user?.email; // Untuk logging
     const deductionTypeId = context?.params?.deductionTypeId;

     if (!deductionTypeId) {
        return NextResponse.json({ message: 'ID Jenis Potongan diperlukan di URL.' }, { status: 400 });
    }
      console.log(`[API DELETE /admin/deduction-types/${deductionTypeId}] Request by Admin: ${adminUserId}`);

    try {
        await prisma.deductionType.delete({
            where: { id: deductionTypeId },
        });

        console.log(`Deduction Type ${deductionTypeId} dihapus oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Jenis potongan berhasil dihapus.' }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API DELETE /admin/deduction-types/${deductionTypeId}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') { return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan.` }, { status: 404 }); }
            if (error.code === 'P2003') { return NextResponse.json({ message: 'Gagal menghapus: Jenis potongan ini masih digunakan oleh pengguna.' }, { status: 400 }); }
            if (error.code === 'P2023') { return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 }); }
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        return NextResponse.json({ message: 'Gagal menghapus jenis potongan.' }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getDeductionTypeHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateDeductionTypeHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteDeductionTypeHandler, Role.SUPER_ADMIN);