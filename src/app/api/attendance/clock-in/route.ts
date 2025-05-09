// src/app/api/attendance/clock-in/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus, Role } from '@prisma/client'; // Import Prisma namespace & Role
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Pastikan path benar
// Import getBatasTerlambat dari lokasi yang benar
import { getBatasTerlambat } from '@/lib/config'; // atau '@/lib/attendanceLogic' jika di sana
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

const clockInHandler = async (request: AuthenticatedRequest) => {
  const userId = request.user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0); // Awal hari ini waktu lokal server

  let latitudeDb: Prisma.Decimal | null = null;
  let longitudeDb: Prisma.Decimal | null = null;
  let selfieUrlDb: string | null = null;
  let notesDb: string | null = null;
  let deviceModelDb: string | null = null;
  let deviceOSDb: string | null = null;
  let isMockLocationInDb: boolean | null = false; // Default ke false
  let gpsAccuracyInDb: Prisma.Decimal | null = null;

  try {
    console.log(`[API Clock-In] User ${userId}: Attempting to read FormData...`);
    const formData = await request.formData();
    console.log(`[API Clock-In] User ${userId}: FormData received.`);

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
      isMockLocationInDb = isMockLocationString === 'true';
    }
    if (gpsAccuracyString && !isNaN(parseFloat(gpsAccuracyString))) {
      gpsAccuracyInDb = new Prisma.Decimal(parseFloat(gpsAccuracyString));
    }

    console.log(`[API Clock-In] User ${userId} location: Lat=${latitudeDb}, Long=${longitudeDb}, Accuracy=${gpsAccuracyInDb}, Mock=${isMockLocationInDb}`);
    console.log(`[API Clock-In] User ${userId} device: Model=${deviceModelDb}, OS=${deviceOSDb}`);

    if (latitudeDb === null || longitudeDb === null) {
        return NextResponse.json({ success: false, message: 'Data lokasi (latitude, longitude) wajib diisi.' }, { status: 400 });
    }
    if (!selfieFile) {
        return NextResponse.json({ success: false, message: 'File selfie wajib diunggah.' }, { status: 400 });
    }

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
        selfieUrlDb = null;
      }
    }

  } catch (e) {
    console.error(`[API Clock-In] User ${userId}: Error reading FormData.`, e);
    return NextResponse.json({ success: false, message: 'Gagal memproses data request (FormData).' }, { status: 400 });
  }

  if (!selfieUrlDb) {
      return NextResponse.json({ success: false, message: 'Selfie wajib diunggah dan gagal disimpan.' }, { status: 400 });
  }

  try {
    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: {
        userId: userId,
        clockIn: { gte: todayStart, lte: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 -1) },
      },
      select: { 
        id: true, 
        status: true, 
        clockOut: true, 
        clockIn: true,
        // **PERBAIKAN: Tambahkan field device & GPS jika perlu diupdate saat existingRecord ditemukan**
        // (Meskipun logika saat ini tidak mengupdate field ini jika record sudah ada,
        //  menambahkannya di select tidak berbahaya dan konsisten jika logika berubah)
        deviceModel: true,
        deviceOS: true,
        isMockLocationIn: true,
        gpsAccuracyIn: true
      }
    });

    if (existingRecord && !existingRecord.clockOut) {
      // Logika jika sudah ada clock-in tapi belum clock-out
      // Jika Anda ingin mengupdate info device saat ini, lakukan di sini
      // Untuk sekarang, kita kembalikan error saja sesuai logika sebelumnya
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

    const batasTerlambat = await getBatasTerlambat(now);
    const initialStatus = now > batasTerlambat ? AttendanceStatus.TERLAMBAT : AttendanceStatus.HADIR;
    console.log(`[API Clock-In] User ${userId} - Batas Terlambat: ${batasTerlambat.toISOString()}, Waktu Sekarang: ${now.toISOString()}, Initial Status: ${initialStatus}`);

    const newRecord = await prisma.attendanceRecord.create({
      data: {
        userId: userId,
        clockIn: now,
        status: initialStatus,
        latitudeIn: latitudeDb,
        longitudeIn: longitudeDb,
        selfieInUrl: selfieUrlDb,
        notes: notesDb,
        deviceModel: deviceModelDb,
        deviceOS: deviceOSDb,
        isMockLocationIn: isMockLocationInDb,
        gpsAccuracyIn: gpsAccuracyInDb,
      },
      select: { // **PERBAIKAN: Pastikan SEMUA field yang akan digunakan di respons ADA DI SINI**
        id: true, 
        clockIn: true, 
        status: true,
        latitudeIn: true, 
        longitudeIn: true, 
        selfieInUrl: true,
        deviceModel: true,  // <-- Ditambahkan
        deviceOS: true,     // <-- Ditambahkan
        isMockLocationIn: true, // <-- Ditambahkan
        gpsAccuracyIn: true   // <-- Ditambahkan
      }
    });

    console.log(`[API Clock-In] User ${userId} clocked in successfully. Record ID: ${newRecord.id}, Status Saved: ${newRecord.status}`);

    return NextResponse.json({
      success: true, message: 'Clock in berhasil!',
      data: {
        id: newRecord.id, status: newRecord.status,
        clockIn: newRecord.clockIn.toISOString(),
        latitudeIn: newRecord.latitudeIn !== null ? Number(newRecord.latitudeIn) : null,
        longitudeIn: newRecord.longitudeIn !== null ? Number(newRecord.longitudeIn) : null,
        selfieUrl: newRecord.selfieInUrl,
        deviceModel: newRecord.deviceModel, // Sekarang newRecord.deviceModel ada
        deviceOS: newRecord.deviceOS,       // Sekarang newRecord.deviceOS ada
        isMockLocationIn: newRecord.isMockLocationIn, // Sekarang newRecord.isMockLocationIn ada
        gpsAccuracyIn: newRecord.gpsAccuracyIn !== null ? Number(newRecord.gpsAccuracyIn) : null, // Sekarang newRecord.gpsAccuracyIn ada
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

export const POST = withAuth(clockInHandler);
