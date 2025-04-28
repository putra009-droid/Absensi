// src/app/api/admin/allowance-types/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import

// Handler GET
const getAllowanceTypesHandler = async (request: AuthenticatedRequest) => {
    // userId tidak langsung dipakai, tapi bisa untuk logging
    const adminUserId = request.user?.id;
    console.log(`[API GET /admin/allowance-types] Request by Admin: ${adminUserId}`);
    try {
        const allowanceTypes = await prisma.allowanceType.findMany({
            orderBy: { name: 'asc' },
        });
        return NextResponse.json(allowanceTypes);
    } catch (error) {
        console.error('[API GET /admin/allowance-types] Prisma Error:', error);
        return NextResponse.json({ message: 'Gagal mengambil daftar jenis tunjangan.' }, { status: 500 });
    }
};

// Handler POST
const createAllowanceTypeHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id; // Untuk logging
    const adminEmail = request.user?.email; // Untuk logging
    console.log(`[API POST /admin/allowance-types] Request by Admin: ${adminUserId}`);
    try {
        const body = await request.json();
        const { name, description, isFixed } = body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return NextResponse.json({ message: 'Nama jenis tunjangan wajib diisi.' }, { status: 400 });
        }
        // Validasi lain jika perlu

        const newAllowanceType = await prisma.allowanceType.create({
            data: {
                name: name.trim(),
                description: description || null,
                isFixed: isFixed === undefined ? true : Boolean(isFixed),
            },
        });

        console.log(`Allowance Type baru ditambahkan oleh admin ${adminEmail} (ID: ${adminUserId}):`, newAllowanceType);
        return NextResponse.json({ message: 'Jenis tunjangan baru berhasil ditambahkan!', allowanceType: newAllowanceType }, { status: 201 });

    } catch (error: unknown) {
        console.error('[API POST /admin/allowance-types] Error:', error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') { // Unique constraint violation
                return NextResponse.json({ message: `Nama jenis tunjangan sudah digunakan.` }, { status: 409 });
            }
            return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        return NextResponse.json({ message: 'Gagal menambahkan jenis tunjangan baru.' }, { status: 500 });
    }
};

// Bungkus kedua handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getAllowanceTypesHandler, Role.SUPER_ADMIN);
export const POST = withAuth(createAllowanceTypeHandler, Role.SUPER_ADMIN);