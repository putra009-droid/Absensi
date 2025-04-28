// src/app/api/admin/allowance-types/[allowanceTypeId]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import

// Interface untuk context params
interface RouteContext {
  params: { allowanceTypeId: string };
}

// Handler GET
const getAllowanceTypeHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const allowanceTypeId = context?.params?.allowanceTypeId;

    if (!allowanceTypeId) {
        return NextResponse.json({ message: 'ID Jenis Tunjangan diperlukan di URL.' }, { status: 400 });
    }
    console.log(`[API GET /admin/allowance-types/${allowanceTypeId}] Request by Admin: ${adminUserId}`);

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
};

// Handler PUT
const updateAllowanceTypeHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // untuk logging
    const allowanceTypeId = context?.params?.allowanceTypeId;

    if (!allowanceTypeId) {
        return NextResponse.json({ message: 'ID Jenis Tunjangan diperlukan di URL.' }, { status: 400 });
    }
    console.log(`[API PUT /admin/allowance-types/${allowanceTypeId}] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { name, description, isFixed } = body;

        if (name === undefined && description === undefined && isFixed === undefined) { // Cek ketat undefined
            return NextResponse.json({ message: 'Tidak ada data yang dikirim untuk diperbarui.' }, { status: 400 });
        }
        if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
          return NextResponse.json({ message: 'Nama jenis tunjangan tidak boleh kosong jika diubah.' }, { status: 400 });
        }
        if (isFixed !== undefined && typeof isFixed !== 'boolean') {
           return NextResponse.json({ message: 'Nilai isFixed harus boolean (true/false) jika diubah.' }, { status: 400 });
        }

        const dataToUpdate: Prisma.AllowanceTypeUpdateInput = {};
        if (name !== undefined) dataToUpdate.name = name.trim(); // Perbarui jika ada
        if (description !== undefined) dataToUpdate.description = description || null; // Perbarui jika ada
        if (isFixed !== undefined) dataToUpdate.isFixed = isFixed; // Perbarui jika ada

        const updatedAllowanceType = await prisma.allowanceType.update({
            where: { id: allowanceTypeId },
            data: dataToUpdate,
        });

        console.log(`Allowance Type ${allowanceTypeId} diupdate oleh admin ${adminEmail} (ID: ${adminUserId}):`, updatedAllowanceType);
        return NextResponse.json(
            { message: 'Jenis tunjangan berhasil diperbarui!', allowanceType: updatedAllowanceType },
            { status: 200 }
        );

    } catch (error: unknown) {
        console.error(`[API PUT /admin/allowance-types/${allowanceTypeId}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') {
                return NextResponse.json({ message: `Jenis tunjangan dengan ID '${allowanceTypeId}' tidak ditemukan.` }, { status: 404 });
            }
            if (error.code === 'P2002') { // Unique constraint
                 return NextResponse.json({ message: `Nama jenis tunjangan sudah digunakan.` }, { status: 409 });
            }
            if (error.code === 'P2023') { // Invalid ID format
                 return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
            }
            // Handle other Prisma errors
            return NextResponse.json({ message: `Database error: ${error.message}`}, { status: 500 });
        }
         if (error instanceof SyntaxError) { // Body JSON tidak valid
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Fallback error
        return NextResponse.json({ message: 'Gagal memperbarui jenis tunjangan.' }, { status: 500 });
    }
};

// Handler DELETE
const deleteAllowanceTypeHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // untuk logging
    const allowanceTypeId = context?.params?.allowanceTypeId;

     if (!allowanceTypeId) {
        return NextResponse.json({ message: 'ID Jenis Tunjangan diperlukan di URL.' }, { status: 400 });
    }
     console.log(`[API DELETE /admin/allowance-types/${allowanceTypeId}] Request by Admin: ${adminUserId}`);

    try {
        await prisma.allowanceType.delete({
            where: { id: allowanceTypeId },
        });

        console.log(`Allowance Type ${allowanceTypeId} dihapus oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Jenis tunjangan berhasil dihapus.' }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API DELETE /admin/allowance-types/${allowanceTypeId}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') { // Record not found
                return NextResponse.json({ message: `Jenis tunjangan dengan ID '${allowanceTypeId}' tidak ditemukan.` }, { status: 404 });
            }
            if (error.code === 'P2003') { // Foreign key constraint (masih dipakai)
                return NextResponse.json({ message: 'Gagal menghapus: Jenis tunjangan ini masih digunakan.' }, { status: 400 });
            }
            if (error.code === 'P2023') { // Invalid ID format
                 return NextResponse.json({ message: 'Format ID tidak valid.' }, { status: 400 });
            }
            // Handle other Prisma errors
            return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
        }
        // Fallback error
        return NextResponse.json({ message: 'Gagal menghapus jenis tunjangan.' }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getAllowanceTypeHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateAllowanceTypeHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteAllowanceTypeHandler, Role.SUPER_ADMIN);