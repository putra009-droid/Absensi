// File Lokasi: src/app/api/attendance/clock-out/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus, Role } from '@prisma/client'; // Import Prisma namespace & Role
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Pastikan path benar
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';

// Definisikan tipe untuk body request clock-out yang diharapkan dari FormData
interface ClockOutFormData {
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

const clockOutHandler = async (request: AuthenticatedRequest) => {
  const userId = request.user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
  }
  console.log(`[API Clock-Out] Received request from User: ${userId}`);

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
        data: { id: SETTINGS_ID }, // Nilai default akan diambil dari skema Prisma
      });
    }

    // Ambil jam selesai kerja dari pengaturan
    const { workEndTimeHour, workEndTimeMinute } = attendanceSettings;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    console.log(`[API Clock-Out] User: ${userId}, Waktu Saat Ini: ${currentHour}:${currentMinute}, Pengaturan Jam Selesai Kerja: ${workEndTimeHour}:${workEndTimeMinute}`);

    // 2. Periksa Apakah Sudah Waktunya Clock-Out
    // Aturan saat ini: tidak boleh clock-out sebelum jam selesai kerja yang ditentukan.
    // Anda bisa mengubah logika ini jika ingin mengizinkan clock-out lebih awal dengan kondisi tertentu.
    if (currentHour < workEndTimeHour || (currentHour === workEndTimeHour && currentMinute < workEndTimeMinute)) {
      const endTimeFormatted = `${String(workEndTimeHour).padStart(2, '0')}:${String(workEndTimeMinute).padStart(2, '0')}`;
      return NextResponse.json({
        success: false,
        message: `Belum waktunya untuk clock-out. Jam selesai kerja adalah pukul ${endTimeFormatted}.`,
        code: 'CLOCK_OUT_TOO_EARLY'
      }, { status: 403 }); // 403 Forbidden atau 400 Bad Request
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
    
    console.log(`[API Clock-Out] User ${userId} location: Lat=${latitudeDb}, Long=${longitudeDb}, Accuracy=${gpsAccuracyOutDb}, Mock=${isMockLocationOutDb}`);
    console.log(`[API Clock-Out] User ${userId} device: Model=${deviceModelDb}, OS=${deviceOSDb}`);

    // Validasi dasar (latitude, longitude, dan selfie mungkin wajib)
    if (latitudeDb === null || longitudeDb === null) {
      return NextResponse.json({ success: false, message: 'Data lokasi (latitude, longitude) wajib diisi.' }, { status: 400 });
    }
    if (!selfieFile) {
      return NextResponse.json({ success: false, message: 'File selfie wajib diunggah.' }, { status: 400 });
    }

    // 4. Simpan Selfie Clock-Out
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
    if (!selfieUrlDb) { // Jika selfie wajib dan gagal disimpan
        return NextResponse.json({ success: false, message: 'Selfie wajib diunggah dan gagal diproses.' }, { status: 400 });
    }

    // 5. Cari Record Absensi yang Aktif untuk Diperbarui
    console.log(`[API Clock-Out] Mencari record aktif untuk user: ${userId} pada hari ini.`);
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { 
            gte: todayStart, // Clock-in terjadi pada hari ini
            lt: tomorrowStart // Sebelum awal hari berikutnya
        },
        clockOut: null, // Penting: hanya yang belum clock-out
        status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT] } // Hanya yang statusnya masih berjalan
      },
      orderBy: { clockIn: 'desc' } // Ambil yang paling baru jika ada beberapa (seharusnya tidak jika logika clock-in benar)
    });
    console.log(`[API Clock-Out] User ${userId} - Hasil pencarian record aktif:`, activeRecord ? `ID: ${activeRecord.id}, Status: ${activeRecord.status}` : 'Not Found');

    if (!activeRecord) {
      console.warn(`[API Clock-Out] Record aktif tidak ditemukan untuk user: ${userId}`);
      return NextResponse.json(
        { success: false, message: 'Tidak ada absensi aktif (status HADIR/TERLAMBAT) yang ditemukan untuk di-clock-out hari ini. Silakan clock-in terlebih dahulu atau pastikan status absensi Anda benar.' },
        { status: 404 } // 404 Not Found
      );
    }

    // 6. Update Record Absensi dengan Data Clock-Out
    console.log(`[API Clock-Out] User ${userId} - Mengupdate record ID: ${activeRecord.id}`);
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        clockOut: now, // Waktu aktual server saat clock-out
        status: AttendanceStatus.SELESAI, // Set status menjadi SELESAI
        latitudeOut: latitudeDb,
        longitudeOut: longitudeDb,
        selfieOutUrl: selfieUrlDb,
        notes: notesDb ?? activeRecord.notes, // Update notes jika ada, atau biarkan yang lama jika tidak ada input baru
        // Simpan info perangkat & GPS saat clock-out
        deviceModel: deviceModelDb ?? activeRecord.deviceModel, // Ambil dari request, fallback ke data clock-in jika tidak ada
        deviceOS: deviceOSDb ?? activeRecord.deviceOS,
        isMockLocationOut: isMockLocationOutDb, // isMockLocationOutDb sudah boolean
        gpsAccuracyOut: gpsAccuracyOutDb,
      },
      select: { // Pilih field yang ingin dikembalikan dalam respons
        id: true, clockIn: true, clockOut: true, status: true,
        latitudeOut: true, longitudeOut: true, selfieOutUrl: true,
        deviceModel: true, deviceOS: true, isMockLocationOut: true, gpsAccuracyOut: true
        // Anda bisa menambahkan field lain dari activeRecord jika perlu dikembalikan
        // Misalnya, selfieInUrl, latitudeIn, dll.
      }
    });

    console.log(`[API Clock-Out] User ${userId} clocked out successfully. Record ID: ${updatedRecord.id}, Status: ${updatedRecord.status}`);

    // Kirim respons sukses
    return NextResponse.json({
      success: true, message: 'Clock out berhasil!',
      data: {
        id: updatedRecord.id,
        status: updatedRecord.status.toString(), // Kirim status sebagai string
        clockIn: updatedRecord.clockIn.toISOString(), // Kirim juga clockIn untuk referensi
        clockOut: updatedRecord.clockOut?.toISOString() ?? null, // clockOut sekarang pasti ada
        latitudeOut: updatedRecord.latitudeOut !== null ? Number(updatedRecord.latitudeOut) : null,
        longitudeOut: updatedRecord.longitudeOut !== null ? Number(updatedRecord.longitudeOut) : null,
        selfieUrl: updatedRecord.selfieOutUrl, // Ini adalah selfieOutUrl
        deviceModel: updatedRecord.deviceModel,
        deviceOS: updatedRecord.deviceOS,
        isMockLocationOut: updatedRecord.isMockLocationOut,
        gpsAccuracyOut: updatedRecord.gpsAccuracyOut !== null ? Number(updatedRecord.gpsAccuracyOut) : null,
      }
    }, { status: 200 }); // Status 200 OK untuk update

  } catch (error: unknown) {
    console.error(`[CLOCK_OUT_ERROR] User ${userId}:`, error);
    let errorMessage = 'Terjadi kesalahan sistem saat clock out.';
    // let errorCode: string | undefined = undefined; // Jika Anda ingin mengirim kode error Prisma

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error saat clock out.`; // Jangan sertakan error.message langsung ke klien untuk keamanan
      // errorCode = error.code;
      return NextResponse.json({ success: false, message: errorMessage /*, code: errorCode */ }, { status: 500 });
    } else if (error instanceof Error) {
      errorMessage = error.message; // Untuk error lain, message bisa lebih informatif
    }
    return NextResponse.json({ success: false, message: `Terjadi kesalahan sistem saat clock out: ${errorMessage}` }, { status: 500 });
  }
};

// Bungkus handler dengan middleware autentikasi
export const POST = withAuth(clockOutHandler as any); // Pastikan withAuth di-cast jika perlu
