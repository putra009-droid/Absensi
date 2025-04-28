// src/app/api/admin/users/[userId]/route.ts

import { NextResponse } from 'next/server';
// HAPUS: import { getServerSession } from 'next-auth/next';
// HAPUS: import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import helper auth

// Interface untuk menangkap parameter dinamis dari context
interface RouteContext {
    params: { userId: string };
}

// Tipe untuk body request PUT (agar lebih jelas)
interface UpdateUserRequestBody {
    name?: string;
    role?: Role;
    baseSalary?: string | number | null;
}

// =====================================================================
// ===           FUNGSI GET (Get User Details by ID)                 ===
// =====================================================================
const getUserDetailsHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id; // Admin yang melakukan request
    const userIdToGet = context?.params?.userId; // User ID dari URL path

    if (!userIdToGet) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
    console.log(`[API GET /admin/users/${userIdToGet}] Request by Admin: ${adminUserId}`);

    try {
        const user = await prisma.user.findUnique({
            where: { id: userIdToGet },
            // Pilih field yang ingin dikembalikan (jangan sertakan password)
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                baseSalary: true,
                createdAt: true,
                updatedAt: true,
                // Tambahkan relasi lain jika perlu ditampilkan di detail user
                // allowances: { include: { allowanceType: true } },
                // deductions: { include: { deductionType: true } },
            }
        });

        if (!user) {
            return NextResponse.json({ message: `User dengan ID '${userIdToGet}' tidak ditemukan.` }, { status: 404 });
        }

        // Serialisasi data Decimal sebelum dikirim
        const responseData = {
            ...user,
            baseSalary: user.baseSalary?.toString() ?? null,
            // Jika menyertakan allowances/deductions, serialize juga amount/percentage-nya
        };

        return NextResponse.json(responseData);

    } catch (error: unknown) {
        console.error(`[API GET /admin/users/${userIdToGet}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Error format ID CUID/UUID dari Prisma
            if (error.code === 'P2023' || error.message.includes('Malformed ObjectID')) {
                return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
            }
            return NextResponse.json({ message: 'Database error occurred.', errorCode: error.code }, { status: 500 });
        }
        // Error tak terduga lainnya
        return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
    }
};


// =====================================================================
// ===          FUNGSI PUT (Update User Data by ID)                  ===
// =====================================================================
const updateUserByIdHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    const userIdToUpdate = context?.params?.userId;

    if (!userIdToUpdate) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
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

       // 2. Validasi Input (minimal 1 field harus ada untuk update)
        if (name === undefined && role === undefined && rawBaseSalary === undefined) {
            return NextResponse.json({ message: 'Minimal satu field (name, role, atau baseSalary) harus diisi untuk update.' }, { status: 400 });
        }

        // Siapkan data yang akan diupdate
        const dataToUpdate: Prisma.UserUpdateInput = {};

        // Validasi spesifik per field (sama seperti di PUT /api/admin/users)
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') { return NextResponse.json({ message: 'Nama tidak boleh kosong jika diupdate.' }, { status: 400 }); }
            dataToUpdate.name = name.trim();
        }
        if (role !== undefined) {
            if (!Object.values(Role).includes(role as Role)) { return NextResponse.json({ message: `Role '${role}' tidak valid.` }, { status: 400 }); }
            if (role === Role.SUPER_ADMIN) { return NextResponse.json({ message: `Pengaturan role SUPER_ADMIN tidak diizinkan.` }, { status: 400 }); }
            // Cek super admin terakhir
            if (userIdToUpdate === adminUserId && role !== Role.SUPER_ADMIN) {
                const superAdminCount = await prisma.user.count({ where: { role: Role.SUPER_ADMIN }});
                if (superAdminCount <= 1) { return NextResponse.json({ message: 'Super Admin terakhir tidak dapat mengubah role diri sendiri.' }, { status: 400 }); }
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
        // Jangan update email atau password di sini, buat endpoint terpisah jika perlu

        // 3. Lakukan Update di Database
        const updatedUser = await prisma.user.update({
            where: { id: userIdToUpdate },
            data: dataToUpdate,
            select: { // Pilih field yang akan dikembalikan
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

    } catch (error: unknown) {
        console.error(`[API PUT /admin/users/${userIdToUpdate}] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') { // Record to update not found
                 return NextResponse.json({ message: `User dengan ID '${userIdToUpdate}' tidak ditemukan.` }, { status: 404 });
            }
             if (error.code === 'P2023') { // Invalid ID format
                return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
            }
            // Handle error lain jika perlu (misal P2002 jika ada unique constraint lain)
            return NextResponse.json({ message: `Database error.`, code: error.code }, { status: 500 });
        }
         if (error instanceof SyntaxError) { // Body JSON tidak valid
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Error umum lainnya
        return NextResponse.json({ message: 'Gagal memperbarui data pengguna karena kesalahan server.' }, { status: 500 });
    }
};

// =====================================================================
// ===          FUNGSI DELETE (Delete User by ID)                   ===
// =====================================================================
const deleteUserByIdHandler = async (request: AuthenticatedRequest, context?: RouteContext) => {
     const adminUserId = request.user?.id;
     const adminEmail = request.user?.email;
     const userIdToDelete = context?.params?.userId;

     if (!userIdToDelete) {
        return NextResponse.json({ message: 'User ID diperlukan di URL path.' }, { status: 400 });
    }
     console.log(`[API DELETE /admin/users/${userIdToDelete}] Request by Admin: ${adminUserId}`);

     // Validasi tambahan: Jangan biarkan Super Admin menghapus diri sendiri
     if (userIdToDelete === adminUserId) {
         return NextResponse.json({ message: 'Anda tidak dapat menghapus akun Anda sendiri.' }, { status: 400 });
     }

      // Opsional: Jangan biarkan menghapus Super Admin lain? Tergantung aturan bisnis.
     // const userToDelete = await prisma.user.findUnique({ where: { id: userIdToDelete }, select: { role: true } });
     // if (userToDelete?.role === Role.SUPER_ADMIN) {
     //     return NextResponse.json({ message: 'Tidak diizinkan menghapus Super Admin lain.' }, { status: 403 });
     // }


     try {
         // Lakukan penghapusan
         await prisma.user.delete({
             where: { id: userIdToDelete }
         });

         console.log(`User (ID: ${userIdToDelete}) deleted by admin ${adminEmail} (ID: ${adminUserId})`);
         // Bisa return 204 No Content atau 200 OK dengan pesan
         return NextResponse.json({ message: 'Pengguna berhasil dihapus.' }, { status: 200 });
         // return new Response(null, { status: 204 }); // Alternatif 204

     } catch (error: unknown) {
         console.error(`[API DELETE /admin/users/${userIdToDelete}] Error:`, error);
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
              if (error.code === 'P2025') { // Record to delete not found
                 return NextResponse.json({ message: `User dengan ID '${userIdToDelete}' tidak ditemukan.` }, { status: 404 });
             }
             if (error.code === 'P2003') { // Foreign key constraint (misal masih ada relasi yg 'Restrict')
                  console.error("Foreign key constraint violation on user delete:", error.meta);
                  return NextResponse.json({ message: 'Gagal menghapus pengguna karena masih memiliki data terkait (misal: absensi, tunjangan). Hapus data terkait terlebih dahulu.' }, { status: 400 });
             }
              if (error.code === 'P2023') { // Invalid ID format
                return NextResponse.json({ message: 'Format User ID tidak valid.' }, { status: 400 });
             }
             return NextResponse.json({ message: `Database error.`, code: error.code }, { status: 500 });
         }
          // Error umum lainnya
         return NextResponse.json({ message: 'Gagal menghapus pengguna karena kesalahan server.' }, { status: 500 });
     }
};


// Bungkus semua handler dengan withAuth dan role SUPER_ADMIN
export const GET = withAuth(getUserDetailsHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateUserByIdHandler, Role.SUPER_ADMIN);
export const DELETE = withAuth(deleteUserByIdHandler, Role.SUPER_ADMIN); // Export DELETE jika ditambahkan