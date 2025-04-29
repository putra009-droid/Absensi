// src/app/api/admin/users/[userId]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// PERBAIKAN: Impor Prisma saja
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface RouteContext tidak lagi diperlukan jika pakai tipe generik
// interface RouteContext {
//     params: { userId: string };
// }

// Tipe untuk body request PUT (tetap berguna)
interface UpdateUserRequestBody {
    name?: string;
    role?: Role;
    baseSalary?: string | number | null;
}

// =====================================================================
// ===           FUNGSI GET (Get User Details by ID)                 ===
// =====================================================================
// PERBAIKAN 2: Signature Context
const getUserDetailsHandler = async (
    request: AuthenticatedRequest,
    context?: { params?: { userId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    // Validasi internal userId
    const userIdToGetParam = context?.params?.userId;
    if (typeof userIdToGetParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userIdToGet = userIdToGetParam;

    console.log(`[API GET /admin/users/${userIdToGet}] Request by Admin: ${adminUserId}`);

    try {
        const user = await prisma.user.findUnique({
            where: { id: userIdToGet },
            select: {
                id: true, name: true, email: true, role: true,
                baseSalary: true, createdAt: true, updatedAt: true,
            }
        });

        if (!user) {
            return NextResponse.json({ message: `User dengan ID '${userIdToGet}' tidak ditemukan.` }, { status: 404 });
        }

        const responseData = {
            ...user,
            baseSalary: user.baseSalary?.toString() ?? null,
        };

        return NextResponse.json(responseData);

    // PERBAIKAN 3: Penanganan error unknown
    } catch (error: unknown) {
        console.error(`[API GET /admin/users/${userIdToGet}] Error:`, error);
        let errorMessage = 'Internal server error.';
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = 'Database error occurred.';
            errorCode = error.code;
            if (error.code === 'P2023' || error.message.includes('Malformed ObjectID')) {
                errorMessage = 'Format User ID tidak valid.';
                return NextResponse.json({ message: errorMessage }, { status: 400 });
            }
            return NextResponse.json({ message: errorMessage, errorCode: errorCode }, { status: 500 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};


// =====================================================================
// ===          FUNGSI PUT (Update User Data by ID)                  ===
// =====================================================================
// PERBAIKAN 2: Signature Context
const updateUserByIdHandler = async (
    request: AuthenticatedRequest,
    context?: { params?: { userId?: string | string[] } }
) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    // Validasi internal userId
    const userIdToUpdateParam = context?.params?.userId;
    if (typeof userIdToUpdateParam !== 'string') {
        return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
    }
    const userIdToUpdate = userIdToUpdateParam;

    console.log(`[API PUT /admin/users/${userIdToUpdate}] Request by Admin: ${adminUserId}`);

    let requestData: UpdateUserRequestBody;
    try {
        // 1. Parse Body
        try {
            requestData = await request.json();
        } catch (e) {
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }

        const { name, role, baseSalary: rawBaseSalary } = requestData;

        if (name === undefined && role === undefined && rawBaseSalary === undefined) {
            return NextResponse.json({ message: 'Minimal satu field (name, role, atau baseSalary) harus diisi untuk update.' }, { status: 400 });
        }

        const dataToUpdate: Prisma.UserUpdateInput = {};

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') { return NextResponse.json({ message: 'Nama tidak boleh kosong jika diupdate.' }, { status: 400 }); }
            dataToUpdate.name = name.trim();
        }
        if (role !== undefined) {
            if (!Object.values(Role).includes(role as Role)) { return NextResponse.json({ message: `Role '${role}' tidak valid.` }, { status: 400 }); }
            if (role === Role.SUPER_ADMIN) { return NextResponse.json({ message: `Pengaturan role SUPER_ADMIN tidak diizinkan.` }, { status: 400 }); }

            // PERBAIKAN 1: Logika cek super admin terakhir
            if (userIdToUpdate === adminUserId) {
                 const currentUserBeingEdited = await prisma.user.findUnique({
                     where: { id: userIdToUpdate },
                     select: { role: true }
                 });
                 // Hanya cek jika user yang diedit adalah SA
                 if (currentUserBeingEdited?.role === Role.SUPER_ADMIN) {
                     const superAdminCount = await prisma.user.count({ where: { role: Role.SUPER_ADMIN }});
                     if (superAdminCount <= 1) {
                         return NextResponse.json({ message: 'Super Admin terakhir tidak dapat mengubah role diri sendiri.' }, { status: 400 });
                     }
                 }
            }
            dataToUpdate.role = role as Role;
        }
        if (rawBaseSalary !== undefined) {
            let salaryToSave: Prisma.Decimal | null = null;
            if (rawBaseSalary !== null && rawBaseSalary !== '') {
                const salaryNumber = Number(rawBaseSalary);
                if (isNaN(salaryNumber) || salaryNumber < 0) { return NextResponse.json({ message: 'Base Salary harus angka positif atau kosong/null.' }, { status: 400 }); }
                salaryToSave = new Prisma.Decimal(salaryNumber);
            }
            dataToUpdate.baseSalary = salaryToSave;
        }

        // 3. Lakukan Update di Database
        const updatedUser = await prisma.user.update({
            where: { id: userIdToUpdate },
            data: dataToUpdate,
            select: {
                id: true, name: true, email: true, role: true,
                updatedAt: true, baseSalary: true
            }
        });

        // 4. Kirim Respons Sukses (Serialize)
        const serializableResponse = {
            ...updatedUser,
            baseSalary: updatedUser.baseSalary?.toString() ?? null,
            updatedAt: updatedUser.updatedAt.toISOString()
        };
        console.log(`User ${updatedUser.email} (ID: ${userIdToUpdate}) updated by admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'User data successfully updated!', user: serializableResponse }, { status: 200 });

    // PERBAIKAN 3: Penanganan error unknown
    } catch (error: unknown) {
        console.error(`[API PUT /admin/users/${userIdToUpdate}] Error:`, error);
        let errorMessage = 'Gagal memperbarui data pengguna karena kesalahan server.';
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error.`; // Pesan lebih generik atau gunakan error.message
            errorCode = error.code;
            if (error.code === 'P2025') {
                 errorMessage = `User dengan ID '${userIdToUpdate}' tidak ditemukan.`;
                 return NextResponse.json({ message: errorMessage }, { status: 404 });
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

// =====================================================================
// ===          FUNGSI DELETE (Delete User by ID)                   ===
// =====================================================================
// PERBAIKAN 2: Signature Context
const deleteUserByIdHandler = async (
    request: AuthenticatedRequest,
    context?: { params?: { userId?: string | string[] } }
) => {
     const adminUserId = request.user?.id;
     const adminEmail = request.user?.email;
     // Validasi internal userId
     const userIdToDeleteParam = context?.params?.userId;
     if (typeof userIdToDeleteParam !== 'string') {
         return NextResponse.json({ message: 'Format User ID tidak valid atau tidak ditemukan di URL.' }, { status: 400 });
     }
     const userIdToDelete = userIdToDeleteParam;

     console.log(`[API DELETE /admin/users/${userIdToDelete}] Request by Admin: ${adminUserId}`);

     if (userIdToDelete === adminUserId) {
         return NextResponse.json({ message: 'Anda tidak dapat menghapus akun Anda sendiri.' }, { status: 400 });
     }

     try {
         await prisma.user.delete({
             where: { id: userIdToDelete }
         });

         console.log(`User (ID: ${userIdToDelete}) deleted by admin ${adminEmail} (ID: ${adminUserId})`);
         return NextResponse.json({ message: 'Pengguna berhasil dihapus.' }, { status: 200 });

     // PERBAIKAN 3: Penanganan error unknown
     } catch (error: unknown) {
         console.error(`[API DELETE /admin/users/${userIdToDelete}] Error:`, error);
         let errorMessage = 'Gagal menghapus pengguna karena kesalahan server.';
         let errorCode: string | undefined = undefined;

         // Gunakan Prisma.PrismaClientKnownRequestError
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
              errorMessage = `Database error.`;
              errorCode = error.code;
              if (error.code === 'P2025') {
                 errorMessage = `User dengan ID '${userIdToDelete}' tidak ditemukan.`;
                 return NextResponse.json({ message: errorMessage }, { status: 404 });
             }
             if (error.code === 'P2003') {
                  console.error("Foreign key constraint violation on user delete:", (error as any).meta); // Casting ke any untuk akses meta
                  errorMessage = 'Gagal menghapus pengguna karena masih memiliki data terkait (misal: absensi, tunjangan). Hapus data terkait terlebih dahulu.';
                  return NextResponse.json({ message: errorMessage }, { status: 400 });
             }
              if (error.code === 'P2023') {
                errorMessage = 'Format User ID tidak valid.';
                return NextResponse.json({ message: errorMessage }, { status: 400 });
             }
             return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
         } else if (error instanceof Error) {
              errorMessage = error.message;
         }
         return NextResponse.json({ message: errorMessage }, { status: 500 });
     }
};


// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN (Perbaikan tercermin di signature handler)
export const GET = withAuth(getUserDetailsHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateUserByIdHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteUserByIdHandler, Role.SUPER_ADMIN);