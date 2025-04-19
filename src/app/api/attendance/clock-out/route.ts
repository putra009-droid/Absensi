// Lokasi File: src/app/api/attendance/clock-out/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus } from '@prisma/client'; // Import Enum Status

export async function POST(request: Request) {
  // 1. Cek Sesi
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Tidak terautentikasi' }, { status: 401 });
  }
  const userId = session.user.id;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  try {
    // 2. Ambil Lat/Lon dari Body
    let latitude: Prisma.Decimal | null = null;
    let longitude: Prisma.Decimal | null = null;
    try {
      const body = await request.json();
      if (typeof body?.latitude === 'number') { latitude = new Prisma.Decimal(body.latitude); }
      if (typeof body?.longitude === 'number') { longitude = new Prisma.Decimal(body.longitude); }
      console.log(`[API Clock-Out] Menerima lokasi: Lat=${latitude}, Long=${longitude}`);
    } catch (e) { console.warn("[API Clock-Out] Body request kosong/bukan JSON, lokasi tidak diproses."); }

    // 3. Cari record aktif yang bisa di-clock-out
    console.log(`[API Clock-Out] Mencari record aktif untuk user: ${userId}`);
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { gte: todayStart }, // Clock in hari ini
        clockOut: null,               // Belum clock out
        // --- PERUBAHAN DI SINI ---
        // Izinkan clock out jika status HADIR atau TERLAMBAT
        status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT] }
        // --- AKHIR PERUBAHAN ---
      },
      orderBy: { clockIn: 'desc' } // Ambil yang paling baru
    });
    console.log(`[API Clock-Out] Hasil pencarian record aktif:`, activeRecord);


    // 4. Handle jika tidak ditemukan record aktif
    if (!activeRecord) {
      console.warn(`[API Clock-Out] Record aktif tidak ditemukan untuk user: ${userId}`);
      return NextResponse.json(
        // Ubah pesan error agar lebih sesuai dengan query baru
        { success: false, message: 'Tidak ada absensi aktif (status HADIR/TERLAMBAT) yang ditemukan untuk di-clock-out hari ini.' },
        { status: 404 } // 404 Not Found
      );
    }

    // 5. Update record dengan waktu & lokasi clock out, ubah status jadi SELESAI
    console.log(`[API Clock-Out] Mengupdate record ID: ${activeRecord.id}`);
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        clockOut: now,
        status: AttendanceStatus.SELESAI, // <-- Set Status SELESAI
        latitudeOut: latitude,
        longitudeOut: longitude
      },
      select: { // Pilih field yang dibutuhkan untuk response
        id: true, clockIn: true, clockOut: true, status: true,
        latitudeOut: true, longitudeOut: true
      }
    });

    // 6. Kirim Response Sukses
    return NextResponse.json({
      success: true,
      message: 'Clock out berhasil!',
      data: { // Format data response
        id: updatedRecord.id,
        status: updatedRecord.status,
        clockIn: updatedRecord.clockIn.toISOString(),
        clockOut: updatedRecord.clockOut?.toISOString() ?? null,
        latitudeOut: updatedRecord.latitudeOut !== null ? Number(updatedRecord.latitudeOut) : null,
        longitudeOut: updatedRecord.longitudeOut !== null ? Number(updatedRecord.longitudeOut) : null,
      }
    });

  } catch (error) {
    console.error('[CLOCK_OUT_ERROR]', error);
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         return NextResponse.json({ success: false, message: 'Database error saat clock out.', code: error.code }, { status: 500 });
     }
    return NextResponse.json({ success: false, message: 'Terjadi kesalahan sistem saat clock out.' }, { status: 500 });
  }
}