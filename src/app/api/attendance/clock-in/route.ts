// src/app/api/attendance/clock-in/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus, PrismaClientKnownRequestError } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import { getBatasTerlambat } from '@/lib/config';
// --- Impor Modul Node.js untuk File System ---
import { writeFile, mkdir } from 'fs/promises'; // Untuk menulis file secara asynchronous
import path from 'path'; // Untuk menggabungkan path direktori
import { Buffer } from 'buffer'; // Untuk menangani data buffer gambar
// --- Akhir Impor ---

// Interface untuk ekspektasi body request (tidak digunakan jika pakai FormData)
// interface ClockInRequestBody { ... }

// Handler POST untuk Clock In (Handle FormData & Simpan File Lokal)
const clockInHandler = async (request: AuthenticatedRequest) => {
    const userId = request.user?.id;
    if (!userId) {
        return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    let latitude: Prisma.Decimal | null = null;
    let longitude: Prisma.Decimal | null = null;
    let selfieFile: File | null = null;
    let selfieUrl: string | null = null; // Path relatif yang akan disimpan di DB

    try {
        // Baca data sebagai FormData
        console.log(`[API Clock-In] User ${userId}: Attempting to read FormData...`);
        const formData = await request.formData();
        console.log(`[API Clock-In] User ${userId}: FormData received.`);

        // Ambil latitude dan longitude
        const latString = formData.get('latitude') as string | null;
        const lonString = formData.get('longitude') as string | null;
        if (latString && !isNaN(parseFloat(latString))) { latitude = new Prisma.Decimal(parseFloat(latString)); }
        if (lonString && !isNaN(parseFloat(lonString))) { longitude = new Prisma.Decimal(parseFloat(lonString)); }
        console.log(`[API Clock-In] User ${userId} location from FormData: Lat=${latitude}, Long=${longitude}`);

        // Ambil file selfie
        const selfieField = formData.get('selfie');
        if (selfieField instanceof File) {
            selfieFile = selfieField;
            console.log(`[API Clock-In] User ${userId} sent a selfie file: Name=${selfieFile.name}, Size=${selfieFile.size}, Type=${selfieFile.type}`);

            // --- Logika Penyimpanan File Lokal ---
            try {
                // 1. Konversi File ke Buffer
                const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());

                // 2. Buat nama file unik
                const timestamp = Date.now();
                const fileExtension = selfieFile.name.split('.').pop() || 'jpg'; // Ambil ekstensi asli atau default ke jpg
                const uniqueFileName = `clockin-${userId}-${timestamp}.${fileExtension}`;

                // 3. Tentukan path penyimpanan di folder public
                const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockin');
                const filePath = path.join(uploadDir, uniqueFileName);

                // 4. Pastikan direktori ada (buat jika belum)
                await mkdir(uploadDir, { recursive: true });

                // 5. Tulis file ke disk
                await writeFile(filePath, fileBuffer);
                console.log(`[API Clock-In] Selfie file saved to: ${filePath}`);

                // 6. Set selfieUrl sebagai path relatif untuk akses web
                // Path ini yang disimpan ke DB dan dikirim ke frontend
                selfieUrl = `/uploads/selfies/clockin/${uniqueFileName}`;
                console.log(`[API Clock-In] Relative Selfie URL set to: ${selfieUrl}`);

            } catch (uploadError) {
                console.error(`[API Clock-In] User ${userId}: Failed to save selfie file!`, uploadError);
                // Putuskan: gagalkan clock-in atau lanjutkan tanpa foto?
                // Untuk sekarang, kita lanjutkan tapi selfieUrl tetap null
                selfieUrl = null; // Set ke null jika upload gagal
                // Jika ingin menggagalkan, tambahkan:
                // return NextResponse.json({ success: false, message: 'Gagal menyimpan foto selfie.' }, { status: 500 });
            }
            // --- Akhir Logika Penyimpanan File ---

        } else if (selfieField) {
             console.warn(`[API Clock-In] User ${userId}: 'selfie' field received but is not a File. Type: ${typeof selfieField}`);
        } else {
            console.log(`[API Clock-In] User ${userId} did not send a 'selfie' file.`);
        }

    } catch (e) {
        console.error(`[API Clock-In] User ${userId}: Error reading FormData.`, e);
        // Lanjutkan tanpa data tambahan jika parsing gagal
    }

    try {
        // Cek absensi yang sudah ada (logika tetap sama)
        const existingRecord = await prisma.attendanceRecord.findFirst({ /* ... where clause ... */
            where: {
                userId: userId, clockIn: { gte: todayStart },
                status: { in: [ AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT, AttendanceStatus.SELESAI, AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI ] }
            }, select: { status: true }
        });
        if (existingRecord) { return NextResponse.json( { success: false, message: `Anda sudah tercatat ${existingRecord.status} hari ini.` }, { status: 409 } ); }

        // Penentuan status awal (HADIR/TERLAMBAT) (logika tetap sama)
        const batasTerlambat = getBatasTerlambat(now);
        const initialStatus = now > batasTerlambat ? AttendanceStatus.TERLAMBAT : AttendanceStatus.HADIR;
        console.log(`[API Clock-In] User ${userId} - Initial Status Determined: ${initialStatus}`);

        // Buat record baru dengan data lokasi dan URL selfie (path relatif)
        const newRecord = await prisma.attendanceRecord.create({
            data: {
                userId: userId,
                clockIn: now,
                status: initialStatus,
                latitudeIn: latitude,
                longitudeIn: longitude,
                selfieInUrl: selfieUrl // <-- Simpan path relatif hasil upload
            },
            select: {
                id: true, clockIn: true, status: true,
                latitudeIn: true, longitudeIn: true, selfieInUrl: true
            }
        });

        console.log(`[API Clock-In] User ${userId} clocked in successfully. Record ID: ${newRecord.id}, Status Saved: ${newRecord.status}, Selfie URL: ${newRecord.selfieInUrl}`);

        // Kirim respons sukses ke frontend
        return NextResponse.json({
            success: true, message: 'Clock in berhasil!',
            data: {
                id: newRecord.id, status: newRecord.status,
                clockIn: newRecord.clockIn.toISOString(),
                latitudeIn: newRecord.latitudeIn !== null ? Number(newRecord.latitudeIn) : null,
                longitudeIn: newRecord.longitudeIn !== null ? Number(newRecord.longitudeIn) : null,
                selfieUrl: newRecord.selfieInUrl // Kirim path relatif selfie
            }
        }, { status: 201 });

    } catch (error) {
        console.error(`[CLOCK_IN_ERROR] User ${userId}:`, error);
        if (error instanceof PrismaClientKnownRequestError) {
            if (error.code === 'P2022') { /* ... error handling ... */ }
            return NextResponse.json({ success: false, message: 'Database error saat clock in.', code: error.code }, { status: 500 });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown system error during clock in.';
        return NextResponse.json({ success: false, message: `Terjadi kesalahan sistem saat clock in: ${errorMessage}` }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi
export const POST = withAuth(clockInHandler);
