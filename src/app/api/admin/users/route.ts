// Lokasi File: src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, User } from '@prisma/client';
import bcrypt from 'bcrypt';

// --- FUNGSI POST (Tambah User - Tidak Berubah) ---
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) { return NextResponse.json({ message: 'Akses Ditolak.' }, { status: 403 }); }
  try {
    const body = await request.json();
    const { name, email, password, role } = body;
    // Validasi Input
    if (!name || !email || !password || !role) { return NextResponse.json({ message: 'Semua field wajib diisi.' }, { status: 400 }); }
    if (typeof password !== 'string' || password.length < 6) { return NextResponse.json({ message: 'Password minimal 6 karakter.' }, { status: 400 }); }
    if (!Object.values(Role).includes(role as Role) || role === Role.SUPER_ADMIN) { return NextResponse.json({ message: `Role tidak valid.` }, { status: 400 }); }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { return NextResponse.json({ message: 'Format email tidak valid.' }, { status: 400 }); }
    const existingUser = await prisma.user.findUnique({ where: { email: email } });
    if (existingUser) { return NextResponse.json({ message: `Email sudah terdaftar.` }, { status: 409 }); }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Buat User Baru (tanpa baseSalary saat create awal)
    const newUser = await prisma.user.create({
      data: { name: name.trim(), email: email, password: hashedPassword, role: role as Role },
      select: { id: true, name: true, email: true, role: true, createdAt: true }
    });
    console.log(`User baru ditambahkan oleh ${session.user.email}:`, newUser);
    return NextResponse.json({ message: 'Pengguna baru berhasil ditambahkan!', user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error('API Admin Add User Error:', error);
    return NextResponse.json({ message: 'Gagal menambahkan pengguna baru.' }, { status: 500 });
  }
}
// --- AKHIR FUNGSI POST ---


// --- FUNGSI PUT (Update User - DIMODIFIKASI UNTUK baseSalary) ---
export async function PUT(request: Request) {
  // 1. Keamanan: Cek Super Admin
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ message: 'Akses Ditolak: Memerlukan hak akses Super Admin.' }, { status: 403 });
  }

  // 2. Ambil data dari body request
  let requestData: { id?: string, name?: string, role?: Role, baseSalary?: string | number | null } = {};
  try {
    requestData = await request.json();
    const { id: userIdToUpdate, name, role, baseSalary: rawBaseSalary } = requestData;

    // 3. Validasi Input Umum
    if (!userIdToUpdate) { return NextResponse.json({ message: 'User ID wajib ada di body request.' }, { status: 400 }); }
    if (!name || typeof name !== 'string' || name.trim() === '') { return NextResponse.json({ message: 'Nama wajib diisi.' }, { status: 400 }); }
    if (!role) { return NextResponse.json({ message: 'Role wajib dipilih.' }, { status: 400 }); }
    if (!Object.values(Role).includes(role as Role) || role === Role.SUPER_ADMIN) { return NextResponse.json({ message: `Role '${role}' tidak valid atau tidak diizinkan.` }, { status: 400 }); }
    if (userIdToUpdate === session.user.id && role !== Role.SUPER_ADMIN) { return NextResponse.json({ message: 'Super Admin tidak dapat mengubah role diri sendiri.' }, { status: 400 }); }

    // --- Validasi & Konversi baseSalary ---
    let salaryToSave: Prisma.Decimal | null = null;
    if (rawBaseSalary !== null && rawBaseSalary !== undefined && rawBaseSalary !== '') {
        const salaryNumber = Number(rawBaseSalary);
        if (isNaN(salaryNumber) || salaryNumber < 0) {
            return NextResponse.json({ message: 'Gaji Pokok harus berupa angka positif atau kosong.' }, { status: 400 });
        }
        salaryToSave = new Prisma.Decimal(salaryNumber); // Konversi ke Decimal
    }
    // --- Akhir Validasi & Konversi ---

    // 4. Siapkan Data Update ke Prisma
    const dataToUpdate: Prisma.UserUpdateInput = {
        name: name.trim(),
        role: role as Role,
        baseSalary: salaryToSave, // Gunakan nilai Decimal atau null
    };

    // 5. Update data pengguna di database
    const updatedUser = await prisma.user.update({
      where: { id: userIdToUpdate },
      data: dataToUpdate,
      select: { id: true, name: true, email: true, role: true, updatedAt: true, baseSalary: true }
    });

    // 6. Kirim Respon Sukses (Serialize Decimal ke String lagi)
    const serializableResponse = {
         ...updatedUser,
         baseSalary: updatedUser.baseSalary?.toString() ?? null // Decimal -> String
    }
    console.log(`User ${updatedUser.email} diupdate oleh ${session.user.email} via PUT /api/admin/users`);
    return NextResponse.json({ message: 'Data pengguna berhasil diperbarui!', user: serializableResponse }, { status: 200 });

  } catch (error: any) {
    console.error(`API Admin Update User (PUT /api/admin/users) Error:`, error);
    if (error instanceof SyntaxError) { return NextResponse.json({ message: 'Format body request tidak valid.' }, { status: 400 }); }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { return NextResponse.json({ message: `Pengguna tidak ditemukan.` }, { status: 404 }); }
      return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ message: 'Gagal memperbarui data pengguna.' }, { status: 500 });
  }
}
// --- AKHIR FUNGSI PUT ---