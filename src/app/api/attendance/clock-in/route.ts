// Lokasi File: src/app/api/attendance/clock-in/route.ts

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
      console.log(`[API Clock-In] Menerima lokasi: Lat=${latitude}, Long=${longitude}`);
    } catch (e) { console.warn("[API Clock-In] Body request kosong/bukan JSON, lokasi tidak diproses."); }

    // 3. Cek jika sudah ada absensi aktif hari ini (HADIR, IZIN, SAKIT)
    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { gte: todayStart }, // Cek dari awal hari ini
        // Cek status yang menandakan sudah masuk kerja hari ini
        status: { in: [AttendanceStatus.HADIR, AttendanceStatus.IZIN, AttendanceStatus.SAKIT] }
      },
      orderBy: { clockIn: 'desc' }
    });

    if (existingRecord) {
      return NextResponse.json(
        { success: false, message: `Anda sudah absen hari ini (status: ${existingRecord.status})`},
        { status: 409 } // 409 Conflict
      );
    }

    // 4. Buat record baru dengan status HADIR
    const newRecord = await prisma.attendanceRecord.create({
      data: {
        userId: userId,
        clockIn: now,
        status: AttendanceStatus.HADIR, // <-- Set Status HADIR
        latitudeIn: latitude,
        longitudeIn: longitude
      },
      // Pilih field yang dibutuhkan frontend
      select: {
        id: true,
        clockIn: true,
        status: true,
        latitudeIn: true,
        longitudeIn: true
      }
    });

    // 5. Kirim Response Sukses dengan format baru
    return NextResponse.json({
      success: true,
      message: 'Clock in berhasil!', // Tambahkan pesan sukses
      data: { // Gunakan key 'data'
        id: newRecord.id,
        status: newRecord.status,
        clockIn: newRecord.clockIn.toISOString(), // Serialize Date
        latitudeIn: newRecord.latitudeIn !== null ? Number(newRecord.latitudeIn) : null, // Serialize Decimal
        longitudeIn: newRecord.longitudeIn !== null ? Number(newRecord.longitudeIn) : null,
      }
    }, { status: 201 }); // Status 201 Created

  } catch (error) {
    console.error('[CLOCK_IN_ERROR]', error);
    // Error handling lebih detail
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
         return NextResponse.json({ success: false, message: 'Database error saat clock in.', code: error.code }, { status: 500 });
     }
    return NextResponse.json({ success: false, message: 'Terjadi kesalahan sistem saat clock in.' }, { status: 500 });
  }
}