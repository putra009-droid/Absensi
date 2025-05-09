// src/app/api/attendance/clock-out/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus, Role } from '@prisma/client'; // Import Prisma namespace & Role
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Pastikan path benar
// Import Node.js types jika diperlukan untuk Buffer/File handling nanti
import { writeFile, mkdir } from 'fs/promises'; // Untuk menulis file secara asynchronous
import path from 'path'; // Untuk menggabungkan path direktori
import { Buffer } from 'buffer'; // Untuk menangani data buffer gambar

// Definisikan tipe untuk body request clock-out yang diharapkan dari FormData
interface ClockOutFormData {
  // attendanceRecordId: string; // Kita akan cari record aktif berdasarkan userId dan waktu
  latitude?: string | null;
  longitude?: string | null;
  selfie?: File | null;
  notes?: string | null;
  // Field baru dari Flutter
  deviceModel?: string | null; // Model HP saat clock-out (bisa jadi beda)
  deviceOS?: string | null;    // OS saat clock-out
  isMockLocation?: string | null;
  gpsAccuracy?: string | null;
}

const clockOutHandler = async (request: AuthenticatedRequest) => {
  const userId = request.user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
  }
  console.log(`[API Clock-Out] Received request from User: ${userId}`);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0); // Awal hari ini waktu lokal server

  let latitudeDb: Prisma.Decimal | null = null;
  let longitudeDb: Prisma.Decimal | null = null;
  let selfieUrlDb: string | null = null;
  let notesDb: string | null = null;
  let deviceModelDb: string | null = null;
  let deviceOSDb: string | null = null;
  let isMockLocationOutDb: boolean | null = false; // Default ke false
  let gpsAccuracyOutDb: Prisma.Decimal | null = null;

  try {
    console.log(`[API Clock-Out] User ${userId}: Attempting to read FormData...`);
    const formData = await request.formData();
    console.log(`[API Clock-Out] User ${userId}: FormData read successfully.`);

    // Ekstrak dan proses data dari FormData
    const latString = formData.get('latitude') as string | null;
    const lonString = formData.get('longitude') as string | null;
    const selfieFile = formData.get('selfie') as File | null;
    notesDb = formData.get('notes') as string | null;
    deviceModelDb = formData.get('deviceModel') as string | null;
    deviceOSDb = formData.get('deviceOS') as string | null;
    const isMockLocationString = formData.get('isMockLocation') as string | null;
    const gpsAccuracyString = formData.get('gpsAccuracy') as string | null;

    if (latString && !isNaN(parseFloat(latString))) {
      latitudeDb = new Prisma.Decimal(parseFloat(latString));
    }
    if (lonString && !isNaN(parseFloat(lonString))) {
      longitudeDb = new Prisma.Decimal(parseFloat(lonString));
    }
    if (isMockLocationString) {
      isMockLocationOutDb = isMockLocationString === 'true';
    }
    if (gpsAccuracyString && !isNaN(parseFloat(gpsAccuracyString))) {
      gpsAccuracyOutDb = new Prisma.Decimal(parseFloat(gpsAccuracyString));
    }
    
    console.log(`[API Clock-Out] User ${userId} location: Lat=${latitudeDb}, Long=${longitudeDb}, Accuracy=${gpsAccuracyOutDb}, Mock=${isMockLocationOutDb}`);
    console.log(`[API Clock-Out] User ${userId} device: Model=${deviceModelDb}, OS=${deviceOSDb}`);

    // Validasi dasar (latitude, longitude, dan selfie mungkin wajib)
    if (latitudeDb === null || longitudeDb === null) {
        return NextResponse.json({ success: false, message: 'Data lokasi (latitude, longitude) wajib diisi.' }, { status: 400 });
    }
    if (!selfieFile) {
        return NextResponse.json({ success: false, message: 'File selfie wajib diunggah.' }, { status: 400 });
    }

    // --- Logika Penyimpanan File Selfie Lokal (Clock-Out) ---
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
        // Pertimbangkan apakah harus gagal total jika selfie gagal disimpan
        // return NextResponse.json({ success: false, message: 'Gagal menyimpan file selfie.' }, { status: 500 });
        selfieUrlDb = null; // Atau set null jika tidak wajib
      }
    }
    // --- Akhir Logika Penyimpanan File ---

  } catch (e) {
    console.error(`[API Clock-Out] User ${userId}: CRITICAL Error reading FormData!`, e);
    return NextResponse.json({ success: false, message: 'Gagal memproses data request (FormData).' }, { status: 400 });
  }

  // Jika selfieUrlDb masih null setelah mencoba menyimpan (dan selfie wajib), kembalikan error
  if (!selfieUrlDb) {
      return NextResponse.json({ success: false, message: 'Selfie wajib diunggah dan gagal disimpan.' }, { status: 400 });
  }

  try {
    // Cari record absensi yang aktif (sudah clock-in, belum clock-out, status HADIR/TERLAMBAT)
    console.log(`[API Clock-Out] Mencari record aktif untuk user: ${userId} pada hari ini.`);
    const activeRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { 
            gte: todayStart,
            lte: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 -1) // Akhir hari ini
        },
        clockOut: null, // Belum clock-out
        status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT] } // Hanya yang statusnya masih berjalan
      },
      orderBy: { clockIn: 'desc' } // Ambil yang paling baru jika ada beberapa (seharusnya tidak)
    });
    console.log(`[API Clock-Out] User ${userId} - Hasil pencarian record aktif:`, activeRecord ? activeRecord.id : 'Not Found');

    if (!activeRecord) {
      console.warn(`[API Clock-Out] Record aktif tidak ditemukan untuk user: ${userId}`);
      return NextResponse.json(
        { success: false, message: 'Tidak ada absensi aktif (status HADIR/TERLAMBAT) yang ditemukan untuk di-clock-out hari ini. Silakan clock-in terlebih dahulu.' },
        { status: 404 }
      );
    }

    // Update record absensi yang aktif
    console.log(`[API Clock-Out] User ${userId} - Mengupdate record ID: ${activeRecord.id}`);
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: activeRecord.id },
      data: {
        clockOut: now,
        status: AttendanceStatus.SELESAI, // Set status menjadi SELESAI
        latitudeOut: latitudeDb,
        longitudeOut: longitudeDb,
        selfieOutUrl: selfieUrlDb,
        notes: notesDb || activeRecord.notes, // Update notes jika ada, atau biarkan yang lama
        // Simpan info perangkat & GPS saat clock-out
        // Jika Anda ingin info perangkat sama dengan clock-in, Anda bisa ambil dari activeRecord.deviceModel, dll.
        // atau biarkan Flutter mengirimkannya lagi saat clock-out.
        deviceModel: deviceModelDb ?? activeRecord.deviceModel, // Ambil dari request, fallback ke data clock-in
        deviceOS: deviceOSDb ?? activeRecord.deviceOS,
        isMockLocationOut: typeof isMockLocationOutDb === 'boolean' ? isMockLocationOutDb : false,
        gpsAccuracyOut: gpsAccuracyOutDb,
      },
      select: { // Pilih field yang ingin dikembalikan
        id: true, clockIn: true, clockOut: true, status: true,
        latitudeOut: true, longitudeOut: true, selfieOutUrl: true,
        deviceModel: true, deviceOS: true, isMockLocationOut: true, gpsAccuracyOut: true
      }
    });

    console.log(`[API Clock-Out] User ${userId} clocked out successfully. Record ID: ${updatedRecord.id}, Status: ${updatedRecord.status}`);

    // Kirim respons sukses
    return NextResponse.json({
      success: true, message: 'Clock out berhasil!',
      data: {
        id: updatedRecord.id,
        status: updatedRecord.status,
        clockIn: updatedRecord.clockIn.toISOString(),
        clockOut: updatedRecord.clockOut?.toISOString() ?? null,
        latitudeOut: updatedRecord.latitudeOut !== null ? Number(updatedRecord.latitudeOut) : null,
        longitudeOut: updatedRecord.longitudeOut !== null ? Number(updatedRecord.longitudeOut) : null,
        selfieUrl: updatedRecord.selfieOutUrl,
        deviceModel: updatedRecord.deviceModel,
        deviceOS: updatedRecord.deviceOS,
        isMockLocationOut: updatedRecord.isMockLocationOut,
        gpsAccuracyOut: updatedRecord.gpsAccuracyOut !== null ? Number(updatedRecord.gpsAccuracyOut) : null,
      }
    });

  } catch (error: unknown) {
    console.error(`[CLOCK_OUT_ERROR] User ${userId}:`, error);
    let errorMessage = 'Terjadi kesalahan sistem saat clock out.';
    let errorCode: string | undefined = undefined;

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error saat clock out: ${error.message}`;
      errorCode = error.code;
      return NextResponse.json({ success: false, message: errorMessage, code: errorCode }, { status: 500 });
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
};

// Bungkus handler dengan middleware autentikasi
// Semua role yang diizinkan untuk clock-out
export const POST = withAuth(clockOutHandler);
