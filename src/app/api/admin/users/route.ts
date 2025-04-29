// src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path benar
import { Role, Prisma, User } from '@prisma/client'; // Import tipe yang diperlukan
import bcrypt from 'bcrypt'; // Import bcrypt untuk hashing
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Import helper autentikasi

// --- Handler POST (Tambah User Baru) ---
const createUserHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    console.log(`[API POST /admin/users] Request to create user by Admin: ${adminEmail} (ID: ${adminUserId})`);

    try {
        const body = await request.json();
        const { name, email, password, role } = body;

        if (!name || !email || !password || !role) {
            return NextResponse.json({ message: 'Semua field wajib diisi (name, email, password, role).' }, { status: 400 });
        }
        if (typeof name !== 'string' || name.trim() === '') {
             return NextResponse.json({ message: 'Nama tidak boleh kosong.' }, { status: 400 });
        }
        if (typeof email !== 'string' || email.trim() === '') {
             return NextResponse.json({ message: 'Email tidak boleh kosong.' }, { status: 400 });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ message: 'Password minimal 6 karakter.' }, { status: 400 });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ message: 'Format email tidak valid.' }, { status: 400 });
        }
        if (!Object.values(Role).includes(role as Role)) {
             return NextResponse.json({ message: `Role '${role}' tidak valid.` }, { status: 400 });
        }
        if (role === Role.SUPER_ADMIN) {
            return NextResponse.json({ message: `Pembuatan SUPER_ADMIN baru tidak diizinkan melalui API ini.` }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase();
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });
        if (existingUser) {
            return NextResponse.json({ message: `Email '${email}' sudah terdaftar.` }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name: name.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role: role as Role,
            },
            select: { id: true, name: true, email: true, role: true, createdAt: true }
        });

        console.log(`New user (ID: ${newUser.id}, Email: ${newUser.email}) created by admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Pengguna baru berhasil ditambahkan!', user: newUser }, { status: 201 });

    } catch (error: unknown) {
        console.error('[API POST /admin/users] Error:', error);
        let errorMessage = 'Gagal menambahkan pengguna baru karena kesalahan server.';
        // Penanganan error unknown sudah benar di sini
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
        } else if (error instanceof SyntaxError) {
            errorMessage = 'Format body request tidak valid (JSON).';
            return NextResponse.json({ message: errorMessage }, { status: 400 });
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};

// --- Handler PUT (Update User) ---
const updateUserHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    console.log(`[API PUT /admin/users] Request to update user by Admin: ${adminEmail} (ID: ${adminUserId})`);

    let requestData: { id: string, name?: string, role?: Role, baseSalary?: string | number | null } = {} as any;
    try {
        try {
            requestData = await request.json();
        } catch (e) {
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }

        const { id: userIdToUpdate, name, role, baseSalary: rawBaseSalary } = requestData;

        if (!userIdToUpdate || typeof userIdToUpdate !== 'string') {
            return NextResponse.json({ message: 'User ID (id) wajib ada di body request dan berupa string.' }, { status: 400 });
        }
        if (name === undefined && role === undefined && rawBaseSalary === undefined) {
             return NextResponse.json({ message: 'Minimal satu field (name, role, atau baseSalary) harus diisi untuk update.' }, { status: 400 });
        }

        const dataToUpdate: Prisma.UserUpdateInput = {};

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') {
                return NextResponse.json({ message: 'Nama tidak boleh kosong jika diupdate.' }, { status: 400 });
            }
            dataToUpdate.name = name.trim();
        }
        if (role !== undefined) {
             if (!Object.values(Role).includes(role as Role)) {
                 return NextResponse.json({ message: `Role '${role}' tidak valid.` }, { status: 400 });
             }
             if (role === Role.SUPER_ADMIN) {
                 return NextResponse.json({ message: `Pengaturan role SUPER_ADMIN tidak diizinkan melalui API ini.` }, { status: 400 });
             }
             // PERBAIKAN 1: Hapus perbandingan 'role !== Role.SUPER_ADMIN' yang redundant
             // Cukup cek jika admin mencoba mengubah rolenya sendiri dan dia adalah SA terakhir
             if (userIdToUpdate === adminUserId) {
                 // Ambil role user saat ini dari DB untuk memastikan
                 const currentUserBeingEdited = await prisma.user.findUnique({
                     where: { id: userIdToUpdate },
                     select: { role: true }
                 });
                 // Hanya cek jumlah SA jika user yang diedit adalah SA
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
                 if (isNaN(salaryNumber) || salaryNumber < 0) {
                     return NextResponse.json({ message: 'Gaji Pokok harus berupa angka positif atau kosong/null.' }, { status: 400 });
                 }
                 salaryToSave = new Prisma.Decimal(salaryNumber);
            }
             dataToUpdate.baseSalary = salaryToSave;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userIdToUpdate },
            data: dataToUpdate,
            select: { id: true, name: true, email: true, role: true, updatedAt: true, baseSalary: true }
        });

        const serializableResponse = {
            ...updatedUser,
            baseSalary: updatedUser.baseSalary?.toString() ?? null,
            updatedAt: updatedUser.updatedAt.toISOString(),
        };
        console.log(`User ${updatedUser.email} (ID: ${userIdToUpdate}) updated by admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Data pengguna berhasil diperbarui!', user: serializableResponse }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API PUT /admin/users] Error:`, error);
        let errorMessage = 'Gagal memperbarui data pengguna.';
        let errorCode: string | undefined = undefined;
        // Penanganan error unknown sudah benar di sini
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error: ${error.message}`;
            errorCode = error.code;
            if (error.code === 'P2025') {
                errorMessage = `Pengguna dengan ID yang diberikan tidak ditemukan.`;
                return NextResponse.json({ message: errorMessage }, { status: 404 });
            }
            return NextResponse.json({ message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) {
             errorMessage = error.message;
        }
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
};


// --- Handler GET (Ambil Daftar User) ---
const getUsersHandler = async (request: AuthenticatedRequest) => {
     const adminUserId = request.user?.id;
     console.log(`[API GET /admin/users] Request to get users by Admin: ${adminUserId}`);
     try {
         const users = await prisma.user.findMany({
             where: {
                 // role: { not: Role.SUPER_ADMIN } // Contoh filter
             },
             orderBy: { createdAt: 'desc' },
             select: {
                 id: true, name: true, email: true, role: true,
                 createdAt: true, updatedAt: true, baseSalary: true
             }
         });

         const serializedUsers = users.map(user => ({
             ...user,
             baseSalary: user.baseSalary?.toString() ?? null,
         }));

         return NextResponse.json(serializedUsers);

     // PERBAIKAN 2: Penanganan error 'unknown'
     } catch (error: unknown) {
          console.error(`[API GET /admin/users] Error fetching users:`, error);
          let errorMessage = 'Gagal mengambil daftar pengguna.';
          // Cek tipe error
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
              errorMessage = `Database error: ${error.message}`;
          } else if (error instanceof Error) {
               errorMessage = error.message;
          }
          return NextResponse.json({ message: errorMessage }, { status: 500 });
     }
};


// Bungkus semua handler yang relevan dengan withAuth dan role SUPER_ADMIN
export const POST = withAuth(createUserHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateUserHandler, Role.SUPER_ADMIN);
export const GET = withAuth(getUsersHandler, Role.SUPER_ADMIN);