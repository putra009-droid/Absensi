// src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path benar
import { Role, Prisma, User } from '@prisma/client'; // Import tipe yang diperlukan
import bcrypt from 'bcrypt'; // Import bcrypt untuk hashing
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Import helper autentikasi

// --- Handler POST (Tambah User Baru) ---
const createUserHandler = async (request: AuthenticatedRequest) => {
    // Dapatkan info admin yang melakukan request dari token (via middleware)
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    console.log(`[API POST /admin/users] Request to create user by Admin: ${adminEmail} (ID: ${adminUserId})`);

    try {
        // 1. Ambil data dari body request
        const body = await request.json();
        const { name, email, password, role } = body;

        // 2. Validasi Input Wajib
        //    Pemeriksaan ini yang memicu error "Semua field wajib diisi." jika salah satu field tidak ada atau kosong
        if (!name || !email || !password || !role) {
            return NextResponse.json({ message: 'Semua field wajib diisi (name, email, password, role).' }, { status: 400 });
        }

        // 3. Validasi Spesifik Lainnya
        if (typeof name !== 'string' || name.trim() === '') {
             return NextResponse.json({ message: 'Nama tidak boleh kosong.' }, { status: 400 });
        }
        if (typeof email !== 'string' || email.trim() === '') {
             return NextResponse.json({ message: 'Email tidak boleh kosong.' }, { status: 400 });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ message: 'Password minimal 6 karakter.' }, { status: 400 });
        }
        // Cek format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json({ message: 'Format email tidak valid.' }, { status: 400 });
        }
         // Cek validitas role dan larang pembuatan SUPER_ADMIN baru via API
        if (!Object.values(Role).includes(role as Role)) {
             return NextResponse.json({ message: `Role '${role}' tidak valid.` }, { status: 400 });
        }
        if (role === Role.SUPER_ADMIN) {
            return NextResponse.json({ message: `Pembuatan SUPER_ADMIN baru tidak diizinkan melalui API ini.` }, { status: 400 });
        }

        // 4. Cek Email Existing
        const normalizedEmail = email.toLowerCase(); // Gunakan email lowercase
        const existingUser = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });
        if (existingUser) {
            return NextResponse.json({ message: `Email '${email}' sudah terdaftar.` }, { status: 409 }); // 409 Conflict
        }

        // 5. Hash Password
        const hashedPassword = await bcrypt.hash(password, 10);

        // 6. Buat User Baru di Database
        const newUser = await prisma.user.create({
            data: {
                name: name.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role: role as Role, // Role sudah divalidasi
                // baseSalary bisa diatur terpisah atau diberi default jika perlu
            },
            // Pilih field yang ingin dikembalikan dalam respons
            select: { id: true, name: true, email: true, role: true, createdAt: true }
        });

        console.log(`New user (ID: ${newUser.id}, Email: ${newUser.email}) created by admin ${adminEmail} (ID: ${adminUserId})`);
        // 7. Kirim Respons Sukses
        return NextResponse.json({ message: 'Pengguna baru berhasil ditambahkan!', user: newUser }, { status: 201 }); // 201 Created

    } catch (error: unknown) {
        console.error('[API POST /admin/users] Error:', error);
         if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Handle error spesifik Prisma jika perlu (misal: unique constraint lain)
            return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
         }
         if (error instanceof SyntaxError) {
             // Error jika body request bukan JSON valid
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
         }
         // Error umum lainnya
        return NextResponse.json({ message: 'Gagal menambahkan pengguna baru karena kesalahan server.' }, { status: 500 });
    }
};

// --- Handler PUT (Update User) ---
// Endpoint ini (PUT di /api/admin/users tanpa ID) mungkin kurang ideal untuk update user tunggal.
// Biasanya update dilakukan di /api/admin/users/[userId].
// Namun, kita sesuaikan kode yang ada di file asli Anda.
const updateUserHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id;
    const adminEmail = request.user?.email;
    console.log(`[API PUT /admin/users] Request to update user by Admin: ${adminEmail} (ID: ${adminUserId})`);

    let requestData: { id: string, name?: string, role?: Role, baseSalary?: string | number | null } = {} as any; // Inisialisasi
    try {
        // 1. Parse Body
        try {
            requestData = await request.json();
        } catch (e) {
            return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }

        const { id: userIdToUpdate, name, role, baseSalary: rawBaseSalary } = requestData;

        // 2. Validasi Input
        if (!userIdToUpdate || typeof userIdToUpdate !== 'string') {
            return NextResponse.json({ message: 'User ID (id) wajib ada di body request dan berupa string.' }, { status: 400 });
        }
        // Validasi wajib ada field (minimal salah satu selain ID harus ada untuk update)
        if (name === undefined && role === undefined && rawBaseSalary === undefined) {
             return NextResponse.json({ message: 'Minimal satu field (name, role, atau baseSalary) harus diisi untuk update.' }, { status: 400 });
        }

        // Siapkan data yang akan diupdate
        const dataToUpdate: Prisma.UserUpdateInput = {};

        // Validasi dan tambahkan field jika ada di request
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
             // Cek agar super admin terakhir tidak mengubah rolenya sendiri
            if (userIdToUpdate === adminUserId && role !== Role.SUPER_ADMIN) {
                const superAdminCount = await prisma.user.count({ where: { role: Role.SUPER_ADMIN }});
                if (superAdminCount <= 1) {
                    return NextResponse.json({ message: 'Super Admin terakhir tidak dapat mengubah role diri sendiri.' }, { status: 400 });
                }
            }
            dataToUpdate.role = role as Role;
        }
        if (rawBaseSalary !== undefined) { // Bisa null atau angka
            let salaryToSave: Prisma.Decimal | null = null;
            if (rawBaseSalary !== null && rawBaseSalary !== '') {
                 const salaryNumber = Number(rawBaseSalary);
                 if (isNaN(salaryNumber) || salaryNumber < 0) {
                     return NextResponse.json({ message: 'Gaji Pokok harus berupa angka positif atau kosong/null.' }, { status: 400 });
                 }
                 salaryToSave = new Prisma.Decimal(salaryNumber);
            }
             dataToUpdate.baseSalary = salaryToSave; // Set ke null jika input null/kosong
        }

        // 3. Update data pengguna di Database
        const updatedUser = await prisma.user.update({
            where: { id: userIdToUpdate },
            data: dataToUpdate,
            // Pilih field yang ingin dikembalikan
            select: { id: true, name: true, email: true, role: true, updatedAt: true, baseSalary: true }
        });

        // 4. Kirim Respon Sukses (Serialize Decimal)
        const serializableResponse = {
            ...updatedUser,
            baseSalary: updatedUser.baseSalary?.toString() ?? null,
            updatedAt: updatedUser.updatedAt.toISOString(),
        };
        console.log(`User ${updatedUser.email} (ID: ${userIdToUpdate}) updated by admin ${adminEmail} (ID: ${adminUserId})`);
        return NextResponse.json({ message: 'Data pengguna berhasil diperbarui!', user: serializableResponse }, { status: 200 });

    } catch (error: unknown) {
        console.error(`[API PUT /admin/users] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') { // Record to update not found
                return NextResponse.json({ message: `Pengguna dengan ID yang diberikan tidak ditemukan.` }, { status: 404 });
            }
            // Handle potential unique constraint errors jika ada field unik yg diupdate (misal email jika dibolehkan)
            // if (error.code === 'P2002') { ... }
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        // Error umum lainnya
        return NextResponse.json({ message: 'Gagal memperbarui data pengguna.' }, { status: 500 });
    }
};


// --- Handler GET (Ambil Daftar User) ---
// Tambahkan ini jika belum ada
const getUsersHandler = async (request: AuthenticatedRequest) => {
     const adminUserId = request.user?.id;
     console.log(`[API GET /admin/users] Request to get users by Admin: ${adminUserId}`);
     // TODO: Implement pagination, search, filter by role, etc.
     try {
         const users = await prisma.user.findMany({
             where: {
                 // Contoh filter: jangan tampilkan super admin lain?
                 // role: { not: Role.SUPER_ADMIN }
             },
             orderBy: { createdAt: 'desc' },
             select: { // Pilih data yang ingin ditampilkan di list
                 id: true,
                 name: true,
                 email: true,
                 role: true,
                 createdAt: true,
                 updatedAt: true,
                 baseSalary: true // Kirim juga baseSalary
             }
         });

          // Serialize Decimal
         const serializedUsers = users.map(user => ({
             ...user,
             baseSalary: user.baseSalary?.toString() ?? null,
         }));

         return NextResponse.json(serializedUsers);

     } catch (error) {
          console.error(`[API GET /admin/users] Error fetching users:`, error);
          return NextResponse.json({ message: 'Gagal mengambil daftar pengguna.' }, { status: 500 });
     }
};


// Bungkus semua handler yang relevan dengan withAuth dan role SUPER_ADMIN
export const POST = withAuth(createUserHandler, Role.SUPER_ADMIN);
export const PUT = withAuth(updateUserHandler, Role.SUPER_ADMIN);
export const GET = withAuth(getUsersHandler, Role.SUPER_ADMIN); // Export GET jika ditambahkan