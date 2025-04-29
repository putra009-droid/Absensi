// src/app/api/admin/allowance-types/[allowanceTypeId]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import

// Handler GET (Perbaikan Signature Context)
const getAllowanceTypeHandler = async (
    request: AuthenticatedRequest,
    // Tambahkan '?' setelah 'params'
    context?: { params?: { allowanceTypeId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    // Validasi allowanceTypeId (optional chaining sudah benar)
    const allowanceTypeIdParam = context?.params?.allowanceTypeId;

    if (typeof allowanceTypeIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Jenis Tunjangan tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const allowanceTypeId = allowanceTypeIdParam;

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

// Handler PUT (Perbaikan Signature Context)
const updateAllowanceTypeHandler = async (
    request: AuthenticatedRequest,
    // Tambahkan '?' setelah 'params'
    context?: { params?: { allowanceTypeId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // untuk logging
    // Validasi allowanceTypeId (optional chaining sudah benar)
    const allowanceTypeIdParam = context?.params?.allowanceTypeId;

    if (typeof allowanceTypeIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Jenis Tunjangan tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const allowanceTypeId = allowanceTypeIdParam;

    console.log(`[API PUT /admin/allowance-types/${allowanceTypeId}] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { name, description, isFixed } = body;

        if (name === undefined && description === undefined && isFixed === undefined) {
            return NextResponse.json({ message: 'Tidak ada data yang dikirim untuk diperbarui.' }, { status: 400 });
        }
        if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
          return NextResponse.json({ message: 'Nama jenis tunjangan tidak boleh kosong jika diubah.' }, { status: 400 });
        }
        if (isFixed !== undefined && typeof isFixed !== 'boolean') {
           return NextResponse.json({ message: 'Nilai isFixed harus boolean (true/false) jika diubah.' }, { status: 400 });
        }

        const dataToUpdate: Prisma.AllowanceTypeUpdateInput = {};
        if (name !== undefined) dataToUpdate.name = name.trim();
        if (description !== undefined) dataToUpdate.description = description || null;
        if (isFixed !== undefined) dataToUpdate.isFixed = isFixed;

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
        // Gunakan Prisma.PrismaClientKnownRequestError
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
            return NextResponse.json({ message: `Database error: ${error.message}`}, { status: 500 });
        }
         if (error instanceof SyntaxError) { // Body JSON tidak valid
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        return NextResponse.json({ message: 'Gagal memperbarui jenis tunjangan.' }, { status: 500 });
    }
};

// Handler DELETE (Perbaikan Signature Context)
const deleteAllowanceTypeHandler = async (
    request: AuthenticatedRequest,
    // Tambahkan '?' setelah 'params'
    context?: { params?: { allowanceTypeId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email; // untuk logging
    // Validasi allowanceTypeId (optional chaining sudah benar)
    const allowanceTypeIdParam = context?.params?.allowanceTypeId;

    if (typeof allowanceTypeIdParam !== 'string') {
        return NextResponse.json({ message: 'Format ID Jenis Tunjangan tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const allowanceTypeId = allowanceTypeIdParam;

    console.log(`[API DELETE /admin/allowance-types/${allowanceTypeId}] Request by Admin: ${adminUserId}`);

    try {
        await prisma.allowanceType.delete({
            where: { id: allowanceTypeId },
        });

        console.log(`Allowance Type ${allowanceTypeId} dihapus oleh admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Jenis tunjangan berhasil dihapus.' }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API DELETE /admin/allowance-types/${allowanceTypeId}] Error:`, error);
        // Gunakan Prisma.PrismaClientKnownRequestError
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
            return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ message: 'Gagal menghapus jenis tunjangan.' }, { status: 500 });
    }
};

// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN (Bagian ini tetap sama)
export const GET = withAuth(getAllowanceTypeHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateAllowanceTypeHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteAllowanceTypeHandler, Role.SUPER_ADMIN);