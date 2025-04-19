// Lokasi File: src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Sesuaikan path jika perlu
import { prisma } from '@/lib/prisma';                      // Import Prisma Client
import { Role } from '@prisma/client';                      // Import Enum Role
import bcrypt from 'bcrypt';                                // Import bcrypt

// Fungsi ini HANYA menangani request POST untuk membuat user baru
export async function POST(request: Request) {
  // 1. Keamanan: Cek sesi dan role pengguna yang membuat request
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    // Hanya SUPER_ADMIN yang boleh menambahkan pengguna baru
    return NextResponse.json(
      { message: 'Akses Ditolak: Hanya Super Admin yang dapat menambahkan pengguna.' },
      { status: 403 } // 403 Forbidden
    );
  }

  // 2. Ambil data dari body request (dikirim oleh form)
  try {
    const body = await request.json();
    const { name, email, password, role } = body;

    // 3. Validasi Input Dasar
    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { message: 'Semua field (Nama, Email, Password, Role) wajib diisi.' },
        { status: 400 } // 400 Bad Request
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { message: 'Password minimal 6 karakter.' },
        { status: 400 }
      );
    }
    // Validasi Role: Pastikan role yang dikirim valid dan bukan SUPER_ADMIN
    if (!Object.values(Role).includes(role as Role) || role === Role.SUPER_ADMIN) {
        return NextResponse.json(
            { message: `Role tidak valid atau tidak diizinkan: ${role}` },
            { status: 400 }
        );
    }

    // 4. Cek apakah email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });
    if (existingUser) {
      return NextResponse.json(
        { message: `Email '${email}' sudah terdaftar.` },
        { status: 409 } // 409 Conflict
      );
    }

    // 5. Hash password awal yang dibuat oleh Admin
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. Buat pengguna baru di database
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role as Role, // Set role sesuai input form (sudah divalidasi)
        // Anda bisa set emailVerified di sini jika mau, atau biarkan null
        // emailVerified: new Date(),
      },
      // Pilih field yang ingin dikembalikan (jangan sertakan password)
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      }
    });

    // 7. Kirim respon sukses
    return NextResponse.json(
      { message: 'Pengguna baru berhasil ditambahkan!', user: newUser },
      { status: 201 } // 201 Created
    );

  } catch (error: any) { // Tangkap error (misal: error parsing JSON, error DB)
    console.error('API Admin Add User error:', error);
    // Cek jika error karena parsing JSON
    if (error instanceof SyntaxError) {
         return NextResponse.json({ message: 'Format data request tidak valid.' }, { status: 400 });
    }
    // Error umum server
    return NextResponse.json(
      { message: 'Gagal menambahkan pengguna baru karena kesalahan server.' },
      { status: 500 } // 500 Internal Server Error
    );
  }
}

// Anda bisa menambahkan fungsi lain (GET, PUT, DELETE) untuk manajemen user di file ini nanti
// export async function GET(request: Request) { ... }