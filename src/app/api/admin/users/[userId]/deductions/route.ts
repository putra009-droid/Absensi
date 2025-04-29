// src/app/api/admin/users/[userId]/deductions/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, DeductionCalculationType } from '@prisma/client'; // Pastikan Prisma diimpor
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: { userId: string };
// }

// Helper function untuk serialisasi UserDeduction (tidak berubah)
const serializeUserDeduction = (ud: any) => ({
    ...ud,
    assignedAmount: ud.assignedAmount?.toString() ?? null,
    assignedPercentage: ud.assignedPercentage?.toString() ?? null,
    deductionType: ud.deductionType ? {
        id: ud.deductionType.id,
        name: ud.deductionType.name,
        calculationType: ud.deductionType.calculationType,
    } : null,
});

// =====================================================================
// ===      FUNGSI GET (List Deductions for a specific User)         ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const getUserDeductionsHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional
    context?: { params?: { userId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    // Validasi internal userId
    const userIdParam = context?.params?.userId;
    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan

    console.log(`[API GET /admin/users/${userId}/deductions] Request by Admin: ${adminUserId}`);

    try {
        // Ambil UserDeduction yang relevan
        const userDeductions = await prisma.userDeduction.findMany({
            where: {
                userId: userId,
                deductionType: {
                    calculationType: {
                        in: [DeductionCalculationType.FIXED_USER, DeductionCalculationType.PERCENTAGE_USER]
                    }
                }
            },
            include: {
                deductionType: {
                    select: { id: true, name: true, calculationType: true }
                }
            },
            orderBy: { deductionType: { name: 'asc' } }
        });

        // Cek user jika potongan kosong
        if (userDeductions.length === 0) {
            const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
            }
        }

        const serializedDeductions = userDeductions.map(serializeUserDeduction);
        return NextResponse.json(serializedDeductions);

    // Penanganan error unknown sudah benar
    } catch (error: unknown) {
        console.error(`[API GET /admin/users/${userId ?? 'unknown'}/deductions] Error:`, error);
        let errorMessage = 'Gagal mengambil data potongan pengguna.';
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
             errorMessage = `Database error: ${error.message}`;
             if (error.code === 'P2023') {
                 errorMessage = 'Format User ID tidak valid.';
                 return NextResponse.json({ message: errorMessage }, { status: 400 });
             }
             // Kembalikan pesan error Prisma umum
             return NextResponse.json({ message: errorMessage }, { status: 500 });
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};


// =====================================================================
// === FUNGSI POST (Assign/Create Deduction for a specific User)     ===
// =====================================================================
// PERBAIKAN SIGNATURE CONTEXT
const assignDeductionHandler = async (
    request: AuthenticatedRequest,
    // Buat context dan params optional
    context?: { params?: { userId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    // Validasi internal userId
    const userIdParam = context?.params?.userId;
    if (typeof userIdParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userId = userIdParam; // Aman digunakan

    console.log(`[API POST /admin/users/${userId}/deductions] Request by Admin: ${adminUserId}`);

    try {
        const body = await request.json();
        const { deductionTypeId, assignedAmount: rawAmount, assignedPercentage: rawPercentage } = body;

        // --- Validasi Input ---
        if (!deductionTypeId || typeof deductionTypeId !== 'string') {
            return NextResponse.json({ message: 'ID Jenis Potongan (deductionTypeId) wajib diisi.' }, { status: 400 });
        }

        // Cek user dan deduction type
        const [userExists, deductionTypeExists] = await Promise.all([
             prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
             prisma.deductionType.findUnique({ where: { id: deductionTypeId } })
        ]);
        if (!userExists) {
             return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
        }
        if (!deductionTypeExists) {
             return NextResponse.json({ message: `Jenis potongan dengan ID '${deductionTypeId}' tidak ditemukan.` }, { status: 404 });
        }

        // Siapkan data
        const dataToCreate: Prisma.UserDeductionCreateInput = {
            user: { connect: { id: userId } },
            deductionType: { connect: { id: deductionTypeId } },
        };

        // Validasi amount/percentage
        if (deductionTypeExists.calculationType === DeductionCalculationType.FIXED_USER) {
            if (rawAmount === undefined || rawAmount === null || rawAmount === '') { return NextResponse.json({ message: `Jumlah Potongan (assignedAmount) wajib diisi untuk tipe ${deductionTypeExists.calculationType}.` }, { status: 400 }); }
            const amountNum = Number(rawAmount);
            if (isNaN(amountNum) || amountNum < 0) { return NextResponse.json({ message: 'Jumlah Potongan (assignedAmount) harus angka positif.' }, { status: 400 }); }
            dataToCreate.assignedAmount = new Prisma.Decimal(amountNum);
            dataToCreate.assignedPercentage = null;

        } else if (deductionTypeExists.calculationType === DeductionCalculationType.PERCENTAGE_USER) {
            if (rawPercentage === undefined || rawPercentage === null || rawPercentage === '') { return NextResponse.json({ message: `Persentase Potongan (assignedPercentage) wajib diisi untuk tipe ${deductionTypeExists.calculationType}.` }, { status: 400 }); }
            const percentNum = Number(rawPercentage);
            if (isNaN(percentNum) || percentNum < 0 || percentNum > 100) { return NextResponse.json({ message: 'Persentase Potongan (assignedPercentage) harus 0-100.' }, { status: 400 }); }
            dataToCreate.assignedPercentage = new Prisma.Decimal(percentNum);
            dataToCreate.assignedAmount = null;

        } else {
            return NextResponse.json({ message: `Jenis potongan '${deductionTypeExists.name}' (${deductionTypeExists.calculationType}) tidak memerlukan nilai spesifik saat ditetapkan ke pengguna.` }, { status: 400 });
        }

        // Buat UserDeduction baru
        const newUserDeduction = await prisma.userDeduction.create({
            data: dataToCreate,
            include: {
               deductionType: { select: { id: true, name: true, calculationType: true } }
            }
        });

        console.log(`Potongan ${deductionTypeExists.name} (ID: ${newUserDeduction.id}) ditambahkan untuk user ${userExists.email} (ID: ${userId}) oleh admin ${adminEmail} (ID: ${adminUserId})`);

        return NextResponse.json(
            { message: 'Potongan berhasil ditambahkan untuk pengguna!', userDeduction: serializeUserDeduction(newUserDeduction) },
            { status: 201 }
        );

    // Penanganan error unknown sudah benar
    } catch (error: unknown) {
        console.error(`[API POST /admin/users/${userId ?? 'unknown'}/deductions] Error:`, error);
        let errorMessage = 'Gagal menambahkan potongan untuk pengguna.';
        let errorCode: string | undefined = undefined;

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            if (error.code === 'P2002' && (error.meta?.target as string[])?.includes('UserDeduction_userId_deductionTypeId_key')) {
                 errorMessage = 'Jenis potongan ini sudah ditambahkan untuk pengguna tersebut.';
                 return NextResponse.json({ message: errorMessage }, { status: 409 });
            }
            if (error.code === 'P2003') {
                 errorMessage = 'Referensi User atau Jenis Potongan tidak valid.';
                 return NextResponse.json({ message: errorMessage}, { status: 400 });
            }
            if (error.code === 'P2023') {
                 errorMessage = 'Format User ID tidak valid.';
                 return NextResponse.json({ message: errorMessage }, { status: 400 });
            }
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof SyntaxError) {
             errorMessage = 'Format body request tidak valid (JSON).';
             return NextResponse.json({ message: errorMessage }, { status: 400 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth dan role SUPER_ADMIN (Perbaikan tercermin di signature handler)
export const GET = withAuth(getUserDeductionsHandler, Role.SUPER_ADMIN);
export const POST = withAuth(assignDeductionHandler, Role.SUPER_ADMIN);