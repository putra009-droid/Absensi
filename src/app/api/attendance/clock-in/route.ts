// src/app/api/attendance/clock-in/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus, Role } from '@prisma/client'; // Import Prisma namespace & Role
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Pastikan path benar
// --- Impor Modul Node.js untuk File System ---
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
// --- Akhir Impor ---

// Definisikan tipe untuk body request clock-in yang diharapkan dari FormData
interface ClockInFormData {
  latitude?: string | null;
  longitude?: string | null;
  selfie?: File | null;
  notes?: string | null;
  deviceModel?: string | null;
  deviceOS?: string | null;
  isMockLocation?: string | null; // FormData mengirim boolean sebagai string 'true'/'false'
  gpsAccuracy?: string | null;
}

const SETTINGS_ID = "global_settings"; // ID tetap untuk record AttendanceSetting

const clockInHandler = async (request: AuthenticatedRequest) => {
  const userId = request.user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
  }

  const now = new Date(); // Waktu server saat ini
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0); // Awal hari ini waktu lokal server
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1); // Awal hari berikutnya

  let latitudeDb: Prisma.Decimal | null = null;
  let longitudeDb: Prisma.Decimal | null = null;
  let selfieUrlDb: string | null = null;
  let notesDb: string | null = null;
  let deviceModelDb: string | null = null;
  let deviceOSDb: string | null = null;
  let isMockLocationInDb: boolean | null = false;
  let gpsAccuracyInDb: Prisma.Decimal | null = null;

  try {
    // 1. Ambil Pengaturan Absensi
    let attendanceSettings = await prisma.attendanceSetting.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!attendanceSettings) {
      console.log(`[API Clock-In] User ${userId}: Pengaturan absensi tidak ditemukan, membuat default.`);
      attendanceSettings = await prisma.attendanceSetting.create({
        data: { id: SETTINGS_ID }, // Nilai default akan diambil dari skema Prisma
      });
    }

    const { workStartTimeHour, workStartTimeMinute, lateToleranceMinutes } = attendanceSettings;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    console.log(`[API Clock-In] User: ${userId}, Waktu Saat Ini: ${currentHour}:${currentMinute}, Pengaturan Jam Masuk: ${workStartTimeHour}:${workStartTimeMinute}`);

    // 2. Periksa Apakah Sudah Waktunya Clock-In
    if (currentHour < workStartTimeHour || (currentHour === workStartTimeHour && currentMinute < workStartTimeMinute)) {
      const startTimeFormatted = `${String(workStartTimeHour).padStart(2, '0')}:${String(workStartTimeMinute).padStart(2, '0')}`;
      return NextResponse.json({
        success: false,
        message: `Belum waktunya untuk clock-in. Jam masuk adalah pukul ${startTimeFormatted}.`,
        code: 'CLOCK_IN_TOO_EARLY'
      }, { status: 403 });
    }

    // 3. Proses FormData
    console.log(`[API Clock-In] User ${userId}: Attempting to read FormData...`);
    const formData = await request.formData();
    console.log(`[API Clock-In] User ${userId}: FormData received.`);

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
    if (isMockLocationString) isMockLocationInDb = isMockLocationString === 'true';
    if (gpsAccuracyString && !isNaN(parseFloat(gpsAccuracyString))) gpsAccuracyInDb = new Prisma.Decimal(parseFloat(gpsAccuracyString));

    console.log(`[API Clock-In] User ${userId} location: Lat=${latitudeDb}, Long=${longitudeDb}, Accuracy=${gpsAccuracyInDb}, Mock=${isMockLocationInDb}`);
    console.log(`[API Clock-In] User ${userId} device: Model=${deviceModelDb}, OS=${deviceOSDb}`);

    if (latitudeDb === null || longitudeDb === null) {
      return NextResponse.json({ success: false, message: 'Data lokasi (latitude, longitude) wajib diisi.' }, { status: 400 });
    }
    if (!selfieFile) {
      return NextResponse.json({ success: false, message: 'File selfie wajib diunggah.' }, { status: 400 });
    }

    // 4. Simpan Selfie
    if (selfieFile) {
      try {
        const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());
        const timestamp = Date.now();
        const fileExtension = selfieFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const uniqueFileName = `clockin-${userId}-${timestamp}.${fileExtension}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockin');
        const filePath = path.join(uploadDir, uniqueFileName);
        await mkdir(uploadDir, { recursive: true });
        await writeFile(filePath, fileBuffer);
        console.log(`[API Clock-In] Selfie file saved to: ${filePath}`);
        selfieUrlDb = `/uploads/selfies/clockin/${uniqueFileName}`;
      } catch (uploadError) {
        console.error(`[API Clock-In] User ${userId}: Failed to save selfie file!`, uploadError);
        return NextResponse.json({ success: false, message: 'Gagal menyimpan file selfie.' }, { status: 500 });
      }
    }
    if (!selfieUrlDb) {
        return NextResponse.json({ success: false, message: 'Selfie wajib diunggah dan gagal diproses.' }, { status: 400 });
    }


    // 5. Cek Absensi Sebelumnya
    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { gte: todayStart, lt: tomorrowStart },
      },
      select: { id: true, status: true, clockOut: true, clockIn: true }
    });

    if (existingRecord && !existingRecord.clockOut) {
      return NextResponse.json(
        { success: false, message: `Anda sudah melakukan clock-in hari ini pada pukul ${new Date(existingRecord.clockIn!).toLocaleTimeString('id-ID')} dan belum clock-out. Status: ${existingRecord.status}` },
        { status: 409 }
      );
    }
    if (existingRecord && existingRecord.clockOut) {
      return NextResponse.json(
        { success: false, message: `Anda sudah menyelesaikan absensi hari ini. Status: ${existingRecord.status}` },
        { status: 409 }
      );
    }

    // 6. Tentukan Status Absensi (HADIR atau TERLAMBAT) berdasarkan AttendanceSetting
    // --- PERBAIKAN TIPE DI SINI ---
    let initialStatus: AttendanceStatus = AttendanceStatus.HADIR; // Gunakan enum AttendanceStatus untuk tipe
    // --- AKHIR PERBAIKAN TIPE ---
    
    const workStartTime = new Date(now);
    workStartTime.setHours(workStartTimeHour, workStartTimeMinute, 0, 0);
    
    const lateDeadline = new Date(workStartTime.getTime() + lateToleranceMinutes * 60000);

    console.log(`[API Clock-In] User ${userId} - Jam Masuk Kerja Seharusnya: ${workStartTime.toISOString()}, Batas Terlambat: ${lateDeadline.toISOString()}, Waktu Clock-In: ${now.toISOString()}`);

    if (now > lateDeadline) {
      initialStatus = AttendanceStatus.TERLAMBAT; // Ini sekarang valid
    }
    console.log(`[API Clock-In] User ${userId} - Initial Status: ${initialStatus}`);


    // 7. Buat Catatan Absensi Baru
    const newRecord = await prisma.attendanceRecord.create({
      data: {
        userId: userId,
        clockIn: now,
        status: initialStatus, // initialStatus sekarang bertipe AttendanceStatus
        latitudeIn: latitudeDb,
        longitudeIn: longitudeDb,
        selfieInUrl: selfieUrlDb,
        notes: notesDb,
        deviceModel: deviceModelDb,
        deviceOS: deviceOSDb,
        isMockLocationIn: isMockLocationInDb,
        gpsAccuracyIn: gpsAccuracyInDb,
      },
      select: { 
        id: true, 
        clockIn: true, 
        status: true,
        latitudeIn: true, 
        longitudeIn: true, 
        selfieInUrl: true,
        deviceModel: true,
        deviceOS: true,
        isMockLocationIn: true,
        gpsAccuracyIn: true
      }
    });

    console.log(`[API Clock-In] User ${userId} clocked in successfully. Record ID: ${newRecord.id}, Status Saved: ${newRecord.status}`);

    return NextResponse.json({
      success: true, message: 'Clock in berhasil!',
      data: {
        id: newRecord.id, status: newRecord.status.toString(),
        clockIn: newRecord.clockIn.toISOString(),
        latitudeIn: newRecord.latitudeIn !== null ? Number(newRecord.latitudeIn) : null,
        longitudeIn: newRecord.longitudeIn !== null ? Number(newRecord.longitudeIn) : null,
        selfieUrl: newRecord.selfieInUrl,
        deviceModel: newRecord.deviceModel,
        deviceOS: newRecord.deviceOS,
        isMockLocationIn: newRecord.isMockLocationIn,
        gpsAccuracyIn: newRecord.gpsAccuracyIn !== null ? Number(newRecord.gpsAccuracyIn) : null,
      }
    }, { status: 201 });

  } catch (error) {
    console.error(`[CLOCK_IN_ERROR] User ${userId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ success: false, message: 'Database error saat clock in.', code: error.code }, { status: 500 });
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown system error during clock in.';
    return NextResponse.json({ success: false, message: `Terjadi kesalahan sistem saat clock in: ${errorMessage}` }, { status: 500 });
  }
};

export const POST = withAuth(clockInHandler as any);
