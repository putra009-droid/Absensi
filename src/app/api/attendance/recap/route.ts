// Lokasi File: src/app/api/attendance/recap/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
// Import fungsi logika & tipe data
import { getRekapBulanan, RekapBulan, DetailAbsensiHarian } from '@/lib/attendanceLogic';
import { Prisma } from '@prisma/client'; // Import tipe Prisma

export async function GET(request: Request) {
  // 1. Cek Sesi User
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. Ambil Parameter Tahun & Bulan dari URL
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const targetYear = parseInt(searchParams.get('tahun') || '', 10) || now.getFullYear();
  let targetMonth = parseInt(searchParams.get('bulan') || '', 10);
  if (isNaN(targetMonth) || targetMonth < 0 || targetMonth > 11) { targetMonth = now.getMonth(); }

  // 3. Panggil Fungsi Logika & Handle Serialisasi
  try {
    // Panggil fungsi getRekapBulanan (asumsikan sudah select lat/lon)
    const rekap: RekapBulan = await getRekapBulanan(userId, targetYear, targetMonth);

    // --- SERIALISASI HASIL REKAP ---
    // Ubah Date -> String ISO, Ubah Decimal -> Number
    const serializableRekap = {
      totalHadir: rekap.totalHadir,
      totalTerlambat: rekap.totalTerlambat,
      totalAlpha: rekap.totalAlpha,
      totalHariKerja: rekap.totalHariKerja,
      detailPerHari: rekap.detailPerHari.map(detail => ({
        ...detail, // Salin field lain (status, catatan)
        tanggal: detail.tanggal.toISOString(), // Date -> String
        clockIn: detail.clockIn ? detail.clockIn.toISOString() : null,
        clockOut: detail.clockOut ? detail.clockOut.toISOString() : null,
        // Konversi Decimal ke Number, pastikan cek null
        latitudeIn: detail.latitudeIn !== null && detail.latitudeIn !== undefined ? Number(detail.latitudeIn) : null,
        longitudeIn: detail.longitudeIn !== null && detail.longitudeIn !== undefined ? Number(detail.longitudeIn) : null,
        latitudeOut: detail.latitudeOut !== null && detail.latitudeOut !== undefined ? Number(detail.latitudeOut) : null,
        longitudeOut: detail.longitudeOut !== null && detail.longitudeOut !== undefined ? Number(detail.longitudeOut) : null,
      }))
    };
    // --- AKHIR SERIALISASI ---

    // 4. Kirim Response JSON yang sudah aman
    console.log(`[API Recap] Mengirim rekap (serialized) untuk User ${userId}, ${targetYear}-${targetMonth + 1}`);
    return NextResponse.json(serializableRekap);

  } catch (error: any) {
    console.error("API recap error:", error);
    // Penanganan error spesifik jika perlu
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
     }
    return NextResponse.json({ message: 'Gagal mengambil rekap bulanan karena kesalahan server.' }, { status: 500 });
  }
}