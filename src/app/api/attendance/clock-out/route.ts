// src/app/api/attendance/clock-out/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
import { calculateDistanceInMeters } from '@/lib/locationUtils'; // Impor fungsi kalkulasi jarak

interface ClockOutFormData {
  latitude?: string | null;
  longitude?: string | null;
  selfie?: File | null;
  notes?: string | null;
  deviceModel?: string | null;
  deviceOS?: string | null;
  isMockLocation?: string | null;
  gpsAccuracy?: string | null;
}

const SETTINGS_ID = "global_settings";

const clockOutHandler = async (request: AuthenticatedRequest) => {
  const userId = request.user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
  }
  console.log(`[API Clock-Out] Received request from User: ${userId}`);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  let latitudeDb: Prisma.Decimal | null = null;
  let longitudeDb: Prisma.Decimal | null = null;
  let selfieUrlDb: string | null = null;
  let notesDb: string | null = null;
  let deviceModelDb: string | null = null;
  let deviceOSDb: string | null = null;
  let isMockLocationOutDb: boolean | null = false;
  let gpsAccuracyOutDb: Prisma.Decimal | null = null;

  try {
    // 1. Ambil Pengaturan Absensi
    let attendanceSettings = await prisma.attendanceSetting.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!attendanceSettings) {
      console.log(`[API Clock-Out] User ${userId}: Pengaturan absensi tidak ditemukan, membuat default.`);
      attendanceSettings = await prisma.attendanceSetting.create({
        data: { id: SETTINGS_ID }, // Nilai default dari skema Prisma akan digunakan
      });
    }

    const {
      workEndTimeHour,
      workEndTimeMinute,
      isLocationLockActive,
      targetLatitude,
      targetLongitude,
      allowedRadiusMeters,
    } = attendanceSettings;

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    console.log(`[API Clock-Out] User: ${userId}, Waktu Saat Ini: ${currentHour}:${currentMinute}, Pengaturan Jam Selesai: ${workEndTimeHour}:${workEndTimeMinute}`);
    console.log(`[API Clock-Out] User: ${userId}, Location Lock Active: ${isLocationLockActive}, Target Lat: ${targetLatitude}, Target Lon: ${targetLongitude}, Radius: ${allowedRadiusMeters}m`);

    // 2. Periksa Apakah Sudah Waktunya Clock-Out
    if (currentHour < workEndTimeHour || (currentHour === workEndTimeHour && currentMinute < workEndTimeMinute)) {
      const endTimeFormatted = `${String(workEndTimeHour).padStart(2, '0')}:${String(workEndTimeMinute).padStart(2, '0')}`;
      return NextResponse.json({
        success: false,
        message: `Belum waktunya untuk clock-out. Jam selesai kerja adalah pukul ${endTimeFormatted}.`,
        code: 'CLOCK_OUT_TOO_EARLY'
      }, { status: 403 });
    }

    // 3. Proses FormData
    console.log(`[API Clock-Out] User ${userId}: Attempting to read FormData...`);
    const formData = await request.formData();
    console.log(`[API Clock-Out] User ${userId}: FormData read successfully.`);

    const latString = formData.get('latitude') as string | null;
    const lonString = formData.get('longitude') as string | null;
    const selfieFile = formData.get('selfie') as File | null;
    notesDb = formData.get('notes') as string | null;
    deviceModelDb = formData.get('deviceModel') as string | null;
    deviceOSDb = formData.get('deviceOS') as string | null;
    const isMockLocationString = formData.get('isMockLocation') as string | null;
    const gpsAccuracyString = formData.get('gpsAccuracy') as string | null;

    if (latString && !isNaN(parseFloat(latString))) latitudeDb = new Prisma.Decimal(parseFloat(latString));
    if (lonString && !isNaN(parseFloat(lonString))) longitudeDb = new Prisma.Decimal(parseFloat(lonString));
    if (isMockLocationString) isMockLocationOutDb = isMockLocationString === 'true';
    if (gpsAccuracyString && !isNaN(parseFloat(gpsAccuracyString))) gpsAccuracyOutDb = new Prisma.Decimal(parseFloat(gpsAccuracyString));
    
    console.log(`[API Clock-Out] User ${userId} location from device: Lat=${latitudeDb}, Long=${longitudeDb}, Accuracy=${gpsAccuracyOutDb}, Mock=${isMockLocationOutDb}`);

    // Validasi dasar: selfie wajib
    if (!selfieFile) {
      return NextResponse.json({ success: false, message: 'File selfie wajib diunggah.' }, { status: 400 });
    }

    // 4. Pemeriksaan Lock Lokasi (JIKA AKTIF)
    if (isLocationLockActive) {
      console.log(`[API Clock-Out] User ${userId}: Location lock is ACTIVE. Validating location...`);
      if (targetLatitude === null || targetLongitude === null || allowedRadiusMeters === null) {
        console.warn(`[API Clock-Out] User ${userId}: Location lock active but target location/radius not set by admin.`);
        return NextResponse.json({
          success: false,
          message: 'Fitur pembatasan lokasi aktif tetapi belum dikonfigurasi oleh admin. Hubungi admin.',
          code: 'LOCATION_LOCK_NOT_CONFIGURED'
        }, { status: 400 });
      }
      if (latitudeDb === null || longitudeDb === null) {
        return NextResponse.json({
          success: false,
          message: 'Data lokasi (latitude, longitude) wajib diisi karena pembatasan lokasi aktif.',
          code: 'LOCATION_REQUIRED_FOR_LOCK'
        }, { status: 400 });
      }

      const distance = calculateDistanceInMeters(
        Number(latitudeDb),
        Number(longitudeDb),
        Number(targetLatitude),
        Number(targetLongitude)
      );
      console.log(`[API Clock-Out] User ${userId}: Distance from target: ${distance.toFixed(2)} meters. Allowed radius: ${allowedRadiusMeters}m.`);

      if (distance > allowedRadiusMeters) {
        return NextResponse.json({
          success: false,
          message: `Anda berada di luar radius lokasi absensi yang diizinkan (${allowedRadiusMeters} meter). Jarak Anda: ${distance.toFixed(0)} meter.`,
          code: 'OUT_OF_ALLOWED_RADIUS'
        }, { status: 403 });
      }
    } else {
        console.log(`[API Clock-Out] User ${userId}: Location lock is INACTIVE.`);
        if (latitudeDb === null || longitudeDb === null) {
            console.log(`[API Clock-Out] User ${userId}: Location data not provided, but lock is inactive. Proceeding without location validation.`);
        }
    }

    // 5. Simpan Selfie Clock-Out
    if (selfieFile) {
      try {
        const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());
        const timestamp = Date.now();
        const fileExtension = selfieFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const uniqueFileName = `clockout-${userId}-${timestamp}.${fileExtension}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockout');
        const filePath = path.join(uploadDir, uniqueFileName);
        await mkdir(uploadDir, { recursive: true });
        await writeFile(filePath, fileBuffer);
        console.log(`[API Clock-Out] Selfie file saved to: ${filePath}`);
        selfieUrlDb = `/uploads/selfies/clockout/${uniqueFileName}`;
      } catch (uploadError) {
        console.error(`[API Clock-Out] User ${userId}: Failed to save selfie file!`, uploadError);
        return NextResponse.json({ success: false, message: 'Gagal menyimpan file selfie.' }, { status: 500 });
      }
    }
    if (!selfieUrlDb) {
        return NextResponse.json({ success: false, message: 'Selfie wajib diunggah dan gagal diproses.' }, { status: 400 });
    }

    // 6. Cari Record Absensi yang Aktif untuk Diperbarui
    console.log(`[API Clock-Out] Mencari record aktif untuk user: ${userId} pada hari ini.`);
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { 
            gte: todayStart,
            lt: tomorrowStart 
        },
        clockOut: null,
        status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT] }
      },
      orderBy: { clockIn: 'desc' }
    });
    console.log(`[API Clock-Out] User ${userId} - Hasil pencarian record aktif:`, activeRecord ? `ID: ${activeRecord.id}, Status: ${activeRecord.status}` : 'Not Found');

    if (!activeRecord) {
      console.warn(`[API Clock-Out] Record aktif tidak ditemukan untuk user: ${userId}`);
      return NextResponse.json(
        { success: false, message: 'Tidak ada absensi aktif (status HADIR/TERLAMBAT) yang ditemukan untuk di-clock-out hari ini. Silakan clock-in terlebih dahulu atau pastikan status absensi Anda benar.' },
        { status: 404 }
      );
    }

    // 7. Update Record Absensi dengan Data Clock-Out
    console.log(`[API Clock-Out] User ${userId} - Mengupdate record ID: ${activeRecord.id}`);
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        clockOut: now,
        status: AttendanceStatus.SELESAI,
        latitudeOut: latitudeDb,
        longitudeOut: longitudeDb,
        selfieOutUrl: selfieUrlDb,
        notes: notesDb ?? activeRecord.notes,
        deviceModel: deviceModelDb ?? activeRecord.deviceModel,
        deviceOS: deviceOSDb ?? activeRecord.deviceOS,
        isMockLocationOut: isMockLocationOutDb,
        gpsAccuracyOut: gpsAccuracyOutDb,
      },
      select: { 
        id: true, clockIn: true, clockOut: true, status: true,
        latitudeOut: true, longitudeOut: true, selfieOutUrl: true,
        deviceModel: true, deviceOS: true, isMockLocationOut: true, gpsAccuracyOut: true,
        // Tambahkan field lain yang mungkin ingin Anda kembalikan
        selfieInUrl: true, latitudeIn: true, longitudeIn: true, notes: true 
      }
    });

    console.log(`[API Clock-Out] User ${userId} clocked out successfully. Record ID: ${updatedRecord.id}, Status: ${updatedRecord.status}`);

    return NextResponse.json({
      success: true, message: 'Clock out berhasil!',
      data: {
        id: updatedRecord.id,
        status: updatedRecord.status.toString(),
        clockIn: updatedRecord.clockIn.toISOString(),
        clockOut: updatedRecord.clockOut?.toISOString() ?? null,
        latitudeOut: updatedRecord.latitudeOut !== null ? Number(updatedRecord.latitudeOut) : null,
        longitudeOut: updatedRecord.longitudeOut !== null ? Number(updatedRecord.longitudeOut) : null,
        selfieUrl: updatedRecord.selfieOutUrl, // Ini adalah selfieOutUrl
        // Kembalikan juga data clock-in jika diperlukan oleh UI
        selfieInUrl: updatedRecord.selfieInUrl,
        latitudeIn: updatedRecord.latitudeIn !== null ? Number(updatedRecord.latitudeIn) : null,
        longitudeIn: updatedRecord.longitudeIn !== null ? Number(updatedRecord.longitudeIn) : null,
        notes: updatedRecord.notes,
        deviceModel: updatedRecord.deviceModel, // Ini akan menjadi deviceModel dari clock-out jika dikirim, atau dari clock-in jika tidak
        deviceOS: updatedRecord.deviceOS,
        isMockLocationOut: updatedRecord.isMockLocationOut,
        gpsAccuracyOut: updatedRecord.gpsAccuracyOut !== null ? Number(updatedRecord.gpsAccuracyOut) : null,
      }
    }, { status: 200 });

  } catch (error: unknown) {
    console.error(`[CLOCK_OUT_ERROR] User ${userId}:`, error);
    let errorMessage = 'Terjadi kesalahan sistem saat clock out.';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error saat clock out.`;
      return NextResponse.json({ success: false, message: errorMessage, code: error.code }, { status: 500 });
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ success: false, message: `Terjadi kesalahan sistem saat clock out: ${errorMessage}` }, { status: 500 });
  }
};

export const POST = withAuth(clockOutHandler as any);
