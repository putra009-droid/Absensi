// File: src/app/api/admin/users/[userId]/reset-password/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path ke prisma client benar
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Middleware autentikasi Anda
import { Role } from '@prisma/client'; // Impor enum Role dari Prisma
import bcrypt from 'bcrypt'; // Untuk hashing password

// Handler untuk metode POST
async function handleAdminResetPassword(
  request: AuthenticatedRequest,
  { params }: { params: { userId: string } } // Ambil userId dari parameter path
) {
  // 1. Verifikasi Peran Admin
  // Pastikan hanya SUPER_ADMIN yang bisa mengakses endpoint ini
  if (request.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      { success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang dapat mereset password.' },
      { status: 403 } // 403 Forbidden
    );
  }

  // 2. Ambil userId dari parameter path
  const { userId } = params;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: 'ID Pengguna target tidak ditemukan di URL.' },
      { status: 400 } // 400 Bad Request
    );
  }

  try {
    // 3. Ambil newPassword dari body request
    const body = await request.json();
    const { newPassword } = body;

    // 4. Validasi newPassword
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Password baru diperlukan dan harus berupa string.' },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) { // Samakan dengan validasi saat buat user
      return NextResponse.json(
        { success: false, message: 'Password baru minimal 6 karakter.' },
        { status: 400 }
      );
    }

    // 5. Cek apakah pengguna target ada
    const userToReset = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userToReset) {
      return NextResponse.json(
        { success: false, message: `Pengguna dengan ID ${userId} tidak ditemukan.` },
        { status: 404 } // 404 Not Found
      );
    }

    // (Opsional) Tambahan keamanan: Jangan izinkan SUPER_ADMIN mereset password SUPER_ADMIN lain
    // atau SUPER_ADMIN mereset password dirinya sendiri melalui endpoint ini.
    // SUPER_ADMIN sebaiknya menggunakan fitur "Ubah Password" sendiri jika ingin mengubah passwordnya.
    if (userToReset.role === Role.SUPER_ADMIN && userToReset.id !== request.user.id) {
        // Jika Anda ingin melarang reset password SUPER_ADMIN lain
        // return NextResponse.json({ success: false, message: 'Tidak diizinkan mereset password SUPER_ADMIN lain.' }, { status: 403 });
    }
    // Jika Anda ingin melarang SUPER_ADMIN mereset password dirinya sendiri via endpoint ini
    // if (userToReset.id === request.user.id && request.user.role === Role.SUPER_ADMIN) {
    //     return NextResponse.json({ success: false, message: 'Admin tidak bisa mereset password sendiri melalui endpoint ini. Gunakan fitur ubah password.' }, { status: 403 });
    // }


    // 6. Hash password baru
    const hashedPassword = await bcrypt.hash(newPassword, 10); // Gunakan salt 10

    // 7. Update password pengguna di database
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        updatedAt: new Date(), // Update timestamp
      },
    });

    console.log(`[API Admin Reset Password] Password untuk user ${userId} berhasil direset oleh admin ${request.user.email}`);

    // 8. Kirim respons sukses
    return NextResponse.json(
      { success: true, message: `Password untuk pengguna ${userToReset.name} (${userToReset.email}) berhasil direset.` },
      { status: 200 } // 200 OK atau 204 No Content
    );

  } catch (error: unknown) {
    console.error('[API Admin Reset Password] Error:', error);
    let errorMessage = 'Terjadi kesalahan pada server.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // Tangani error spesifik jika perlu, misalnya jika body JSON tidak valid
    if (error instanceof SyntaxError) {
        errorMessage = 'Format data permintaan tidak valid.';
        return NextResponse.json({ success: false, message: errorMessage }, { status: 400 });
    }

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 } // 500 Internal Server Error
    );
  }
}

// Export handler yang sudah dibungkus middleware autentikasi
// Hanya metode POST yang diizinkan untuk endpoint ini
export const POST = withAuth(handleAdminResetPassword);
