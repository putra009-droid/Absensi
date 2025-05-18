   // src/app/api/attendance/clock-in/route.ts

   import { NextResponse } from 'next/server';
   import { prisma } from '@/lib/prisma';
   import { Prisma, AttendanceStatus } from '@prisma/client';
   import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
   import { writeFile, mkdir } from 'fs/promises';
   import path from 'path';
   import { Buffer } from 'buffer';
   import { calculateDistanceInMeters } from '@/lib/locationUtils'; // Impor fungsi kalkulasi jarak

   interface ClockInFormData {
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

   const clockInHandler = async (request: AuthenticatedRequest) => {
     const userId = request.user?.id;
     if (!userId) {
       return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
     }

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
           data: { id: SETTINGS_ID }, // Nilai default dari skema Prisma akan digunakan
         });
       }

       const {
         workStartTimeHour,
         workStartTimeMinute,
         lateToleranceMinutes,
         isLocationLockActive,
         targetLatitude,
         targetLongitude,
         allowedRadiusMeters,
       } = attendanceSettings;

       const currentHour = now.getHours();
       const currentMinute = now.getMinutes();

       console.log(`[API Clock-In] User: ${userId}, Waktu Saat Ini: ${currentHour}:${currentMinute}, Pengaturan Jam Masuk: ${workStartTimeHour}:${workStartTimeMinute}`);
       console.log(`[API Clock-In] User: ${userId}, Location Lock Active: ${isLocationLockActive}, Target Lat: ${targetLatitude}, Target Lon: ${targetLongitude}, Radius: ${allowedRadiusMeters}m`);

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

       console.log(`[API Clock-In] User ${userId} location from device: Lat=${latitudeDb}, Long=${longitudeDb}, Accuracy=${gpsAccuracyInDb}, Mock=${isMockLocationInDb}`);

       // Validasi dasar: selfie wajib
       if (!selfieFile) {
         return NextResponse.json({ success: false, message: 'File selfie wajib diunggah.' }, { status: 400 });
       }
       
       // 4. Pemeriksaan Lock Lokasi (JIKA AKTIF)
       if (isLocationLockActive) {
         console.log(`[API Clock-In] User ${userId}: Location lock is ACTIVE. Validating location...`);
         if (targetLatitude === null || targetLongitude === null || allowedRadiusMeters === null) {
           console.warn(`[API Clock-In] User ${userId}: Location lock active but target location/radius not set by admin.`);
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
           Number(latitudeDb),  // Konversi Prisma.Decimal ke number
           Number(longitudeDb), // Konversi Prisma.Decimal ke number
           Number(targetLatitude), // Konversi Prisma.Decimal ke number
           Number(targetLongitude) // Konversi Prisma.Decimal ke number
         );
         console.log(`[API Clock-In] User ${userId}: Distance from target: ${distance.toFixed(2)} meters. Allowed radius: ${allowedRadiusMeters}m.`);

         if (distance > allowedRadiusMeters) {
           return NextResponse.json({
             success: false,
             message: `Anda berada di luar radius lokasi absensi yang diizinkan (${allowedRadiusMeters} meter). Jarak Anda: ${distance.toFixed(0)} meter.`,
             code: 'OUT_OF_ALLOWED_RADIUS'
           }, { status: 403 }); // 403 Forbidden karena lokasi tidak sesuai
         }
       } else {
           console.log(`[API Clock-In] User ${userId}: Location lock is INACTIVE.`);
           // Jika lock lokasi tidak aktif, latitude dan longitude dari device tetap disimpan jika ada.
           // Anda bisa memutuskan apakah lokasi tetap wajib meskipun lock tidak aktif.
           // Untuk saat ini, kita asumsikan jika lock tidak aktif, lokasi tidak wajib untuk validasi radius.
           if (latitudeDb === null || longitudeDb === null) {
               console.log(`[API Clock-In] User ${userId}: Location data not provided, but lock is inactive. Proceeding without location validation.`);
           }
       }

       // 5. Simpan Selfie
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
       if (!selfieUrlDb) { // Double check jika selfie wajib
           return NextResponse.json({ success: false, message: 'Selfie wajib diunggah dan gagal diproses.' }, { status: 400 });
       }

       // 6. Cek Absensi Sebelumnya
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

       // 7. Tentukan Status Absensi (HADIR atau TERLAMBAT) berdasarkan AttendanceSetting
       let initialStatus: AttendanceStatus = AttendanceStatus.HADIR;
       const workStartTime = new Date(now);
       workStartTime.setHours(workStartTimeHour, workStartTimeMinute, 0, 0);
       const lateDeadline = new Date(workStartTime.getTime() + lateToleranceMinutes * 60000);

       console.log(`[API Clock-In] User ${userId} - Jam Masuk Kerja Seharusnya: ${workStartTime.toISOString()}, Batas Terlambat: ${lateDeadline.toISOString()}, Waktu Clock-In: ${now.toISOString()}`);

       if (now > lateDeadline) {
         initialStatus = AttendanceStatus.TERLAMBAT;
       }
       console.log(`[API Clock-In] User ${userId} - Initial Status: ${initialStatus}`);

       // 8. Buat Catatan Absensi Baru
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
   