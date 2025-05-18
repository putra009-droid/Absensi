// File Lokasi: src/app/api/user/upload-profile-picture/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma'; // Sesuaikan path ke prisma client Anda
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Sesuaikan path ke authMiddleware Anda
import { writeFile, mkdir, unlink } from 'fs/promises'; // Tambahkan unlink untuk menghapus file lama
import path from 'path';
import { Buffer } from 'buffer';

// Handler untuk POST request (mengunggah foto profil)
const postHandler = async (request: AuthenticatedRequest) => {
  const userId = request.user?.id;

  if (!userId) {
    return NextResponse.json({ success: false, message: 'Tidak terautentikasi.' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('profileImage') as File | null; // 'profileImage' harus cocok dengan key di FormData Flutter

    if (!file) {
      return NextResponse.json({ success: false, message: 'Tidak ada file gambar yang diterima.' }, { status: 400 });
    }

    // Validasi tipe file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, message: 'Tipe file tidak diizinkan. Hanya JPEG, PNG, GIF, WEBP.' }, { status: 415 }); // 415 Unsupported Media Type
    }

    // Validasi ukuran file
    const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSizeInBytes) {
      return NextResponse.json({ success: false, message: `Ukuran file terlalu besar. Maksimal ${maxSizeInBytes / (1024 * 1024)}MB.` }, { status: 413 }); // 413 Payload Too Large
    }

    // Ambil data user saat ini untuk mendapatkan path gambar lama (jika ada)
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true }, // Hanya ambil field image
    });

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const uniqueFileName = `user-${userId}-profile-${timestamp}.${fileExtension}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profile_pictures');
    const filePath = path.join(uploadDir, uniqueFileName);

    // Buat direktori jika belum ada
    await mkdir(uploadDir, { recursive: true });

    // Tulis file baru ke server
    await writeFile(filePath, fileBuffer);
    console.log(`[API Upload Profile] Foto profil baru disimpan ke: ${filePath}`);

    const newRelativeImagePath = `/uploads/profile_pictures/${uniqueFileName}`;

    // Hapus foto profil lama jika ada
    if (currentUser?.image) {
      const oldImagePath = path.join(process.cwd(), 'public', currentUser.image);
      try {
        await unlink(oldImagePath);
        console.log(`[API Upload Profile] Foto profil lama dihapus: ${oldImagePath}`);
      } catch (unlinkError: any) {
        // Abaikan error jika file tidak ditemukan (mungkin sudah dihapus atau path tidak valid)
        if (unlinkError.code !== 'ENOENT') {
          console.error('[API Upload Profile] Gagal menghapus foto profil lama:', unlinkError);
        }
      }
    }

    // Update database pengguna dengan path gambar profil baru (menggunakan field 'image')
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { image: newRelativeImagePath }, // Simpan ke field 'image'
      select: { image: true } // Ambil field 'image' yang diupdate
    });

    return NextResponse.json({
      success: true,
      message: 'Foto profil berhasil diunggah!',
      data: {
        // Kirim kembali dengan key 'profileImageUrl' agar konsisten dengan ekspektasi Flutter
        // meskipun di database disimpan sebagai 'image'.
        profileImageUrl: updatedUser.image,
      },
    }, { status: 200 });

  } catch (error: any) {
    console.error('[API UPLOAD_PROFILE_PICTURE_ERROR]', error);
    // Periksa tipe error untuk respons yang lebih spesifik jika perlu
    // Beberapa error mungkin sudah ditangani oleh validasi di atas (ukuran, tipe)
    if (error.message && error.message.includes('File too large')) { // Ini mungkin tidak akan tercapai jika validasi ukuran file di atas bekerja
        return NextResponse.json({ success: false, message: 'Ukuran file terlalu besar dari konfigurasi server.' }, { status: 413 });
    }
    return NextResponse.json({ success: false, message: 'Gagal mengunggah foto profil karena kesalahan server.' }, { status: 500 });
  }
};

// Gunakan withAuth untuk melindungi route ini
// Pastikan AuthenticatedRequest dan withAuth Anda menangani NextRequest dengan benar
export const POST = withAuth(postHandler as any);

// Anda bisa menambahkan handler lain jika perlu, misalnya DELETE untuk menghapus foto profil
export async function DELETE(request: AuthenticatedRequest) {
  const userId = request.user?.id;

  if (!userId) {
    return NextResponse.json({ success: false, message: 'Tidak terautentikasi.' }, { status: 401 });
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });

    if (currentUser?.image) {
      const imagePath = path.join(process.cwd(), 'public', currentUser.image);
      try {
        await unlink(imagePath);
        console.log(`[API Delete Profile] Foto profil dihapus dari server: ${imagePath}`);
      } catch (unlinkError: any) {
        if (unlinkError.code !== 'ENOENT') {
          console.error('[API Delete Profile] Gagal menghapus file foto profil dari server:', unlinkError);
          // Pertimbangkan apakah akan mengembalikan error atau tetap melanjutkan untuk menghapus dari DB
        }
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { image: null }, // Set field image menjadi null
    });

    return NextResponse.json({
      success: true,
      message: 'Foto profil berhasil dihapus.',
      data: { profileImageUrl: null },
    }, { status: 200 });

  } catch (error) {
    console.error('[API DELETE_PROFILE_PICTURE_ERROR]', error);
    return NextResponse.json({ success: false, message: 'Gagal menghapus foto profil.' }, { status: 500 });
  }
}
// Pastikan withAuth juga diterapkan pada DELETE jika diperlukan
// export const DELETE = withAuth(deleteHandler as any); // Jika Anda membuat deleteHandler terpisah
