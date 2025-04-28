// src/app/api/attendance/clock-out/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
import { Prisma, AttendanceStatus, PrismaClientKnownRequestError } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Pastikan path benar
// Import Node.js types jika diperlukan untuk Buffer/File handling nanti
import { writeFile, mkdir } from 'fs/promises'; // Untuk menulis file secara asynchronous
import path from 'path'; // Untuk menggabungkan path direktori
import { Buffer } from 'buffer'; // Untuk menangani data buffer gambar

// Handler POST untuk Clock Out (Handle FormData & Simpan File Lokal)
const clockOutHandler = async (request: AuthenticatedRequest) => {
    const userId = request.user?.id; // <-- Ambil userId dari token
    if (!userId) {
        return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });
    }
    console.log(`[API Clock-Out] Received request from User: ${userId}`); // <-- Log Awal

    const now = new Date(); // Waktu saat ini
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0); // Awal hari ini

    let latitude: Prisma.Decimal | null = null;
    let longitude: Prisma.Decimal | null = null;
    let selfieFile: File | null = null; // Untuk menyimpan file selfie
    let selfieUrl: string | null = null; // Path relatif yang akan disimpan di DB

    try {
        // --- Baca data sebagai FormData ---
        console.log(`[API Clock-Out] User ${userId}: Attempting to read FormData...`);
        // === Log Sebelum formData() ===
        console.log("[API Clock-Out] About to call request.formData()");
        const formData = await request.formData();
        // === Log Setelah formData() ===
        console.log(`[API Clock-Out] User ${userId}: FormData read successfully.`);

        // Ambil latitude dan longitude dari FormData (sebagai string)
        const latString = formData.get('latitude') as string | null;
        const lonString = formData.get('longitude') as string | null;
        if (latString && !isNaN(parseFloat(latString))) { latitude = new Prisma.Decimal(parseFloat(latString)); }
        if (lonString && !isNaN(parseFloat(lonString))) { longitude = new Prisma.Decimal(parseFloat(lonString)); }
        console.log(`[API Clock-Out] User ${userId} location from FormData: Lat=${latitude}, Long=${longitude}`);

        // Ambil file selfie dari FormData
        const selfieField = formData.get('selfie');
        if (selfieField instanceof File) {
            selfieFile = selfieField;
            console.log(`[API Clock-Out] User ${userId} sent a selfie file: Name=${selfieFile.name}, Size=${selfieFile.size}, Type=${selfieFile.type}`);

            // --- Logika Penyimpanan File Lokal (Clock-Out) ---
            try {
                console.log("[API Clock-Out] Converting selfie to buffer...");
                const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());
                console.log("[API Clock-Out] Buffer created.");

                const timestamp = Date.now();
                const fileExtension = selfieFile.name.split('.').pop() || 'jpg';
                const uniqueFileName = `clockout-${userId}-${timestamp}.${fileExtension}`; // Nama file clock-out

                // Tentukan path penyimpanan di folder public
                const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockout'); // Folder clockout
                const filePath = path.join(uploadDir, uniqueFileName);
                console.log(`[API Clock-Out] Attempting to save selfie to: ${filePath}`);

                // Pastikan direktori ada
                await mkdir(uploadDir, { recursive: true });
                // Tulis file ke disk
                await writeFile(filePath, fileBuffer);
                console.log(`[API Clock-Out] Selfie file saved successfully.`);

                // Set selfieUrl sebagai path relatif
                selfieUrl = `/uploads/selfies/clockout/${uniqueFileName}`; // Path relatif clock-out
                console.log(`[API Clock-Out] Relative Selfie URL set to: ${selfieUrl}`);

            } catch (uploadError) {
                console.error(`[API Clock-Out] User ${userId}: Failed to save selfie file!`, uploadError);
                selfieUrl = null; // Set null jika upload gagal
                // Pertimbangkan menggagalkan proses jika foto wajib
                // return NextResponse.json({ success: false, message: 'Gagal menyimpan foto selfie.' }, { status: 500 });
            }
            // --- Akhir Logika Penyimpanan File ---

        } else if (selfieField) {
             console.warn(`[API Clock-Out] User ${userId}: 'selfie' field received but is not a File. Type: ${typeof selfieField}`);
        } else {
            console.log(`[API Clock-Out] User ${userId} did not send a 'selfie' file.`);
        }
        // --- AKHIR PERUBAHAN ---

    } catch (e) {
        // Error saat membaca FormData
        console.error(`[API Clock-Out] User ${userId}: CRITICAL Error reading FormData!`, e);
        // Jika gagal baca FormData, mungkin sebaiknya hentikan proses
        return NextResponse.json({ success: false, message: 'Gagal memproses data request (FormData).' }, { status: 400 });
    }

    try {
        // Cari record absensi yang aktif (belum clock-out) hari ini
        console.log(`[API Clock-Out] Mencari record aktif untuk user: ${userId}`);
        const activeRecord = await prisma.attendanceRecord.findFirst({
            where: {
                userId: userId,
                clockIn: { gte: todayStart }, // Clock-in hari ini
                clockOut: null,               // Belum clock-out
                // Hanya bisa clock-out jika statusnya HADIR atau TERLAMBAT
                status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT] }
            },
            orderBy: { clockIn: 'desc' } // Ambil yang paling baru
        });
        console.log(`[API Clock-Out] User ${userId} - Hasil pencarian record aktif:`, activeRecord ? activeRecord.id : 'Not Found');

        // Handle jika tidak ada record aktif yang bisa di-clock-out
        if (!activeRecord) {
            console.warn(`[API Clock-Out] Record aktif tidak ditemukan untuk user: ${userId}`);
            return NextResponse.json(
                { success: false, message: 'Tidak ada absensi aktif (status HADIR/TERLAMBAT) yang ditemukan untuk di-clock-out hari ini.' },
                { status: 404 } // Not Found
            );
        }

        // Update record absensi yang aktif
        console.log(`[API Clock-Out] User ${userId} - Mengupdate record ID: ${activeRecord.id}`);
        const updatedRecord = await prisma.attendanceRecord.update({
            where: { id: activeRecord.id },
            data: {
                clockOut: now,                   // Set waktu clock-out
                status: AttendanceStatus.SELESAI, // Ubah status menjadi SELESAI
                latitudeOut: latitude,           // Simpan latitude clock-out
                longitudeOut: longitude,         // Simpan longitude clock-out
                selfieOutUrl: selfieUrl          // <-- Simpan path relatif foto clock-out
            },
            // Pilih field yang ingin dikembalikan ke frontend
            select: {
                id: true,
                clockIn: true,
                clockOut: true,
                status: true,
                latitudeOut: true,
                longitudeOut: true,
                selfieOutUrl: true // Sertakan selfieOutUrl di respons
            }
        });

        console.log(`[API Clock-Out] User ${userId} clocked out successfully. Record ID: ${updatedRecord.id}, Status: ${updatedRecord.status}, Selfie URL: ${updatedRecord.selfieOutUrl}`);

        // Kirim respons sukses ke frontend
        return NextResponse.json({
            success: true, message: 'Clock out berhasil!',
            data: {
                id: updatedRecord.id,
                status: updatedRecord.status,
                clockIn: updatedRecord.clockIn.toISOString(),
                clockOut: updatedRecord.clockOut?.toISOString() ?? null,
                // Konversi Decimal ke number
                latitudeOut: updatedRecord.latitudeOut !== null ? Number(updatedRecord.latitudeOut) : null,
                longitudeOut: updatedRecord.longitudeOut !== null ? Number(updatedRecord.longitudeOut) : null,
                selfieUrl: updatedRecord.selfieOutUrl // Kirim path relatif selfie clock-out
            }
        });

    } catch (error) {
        // Tangani error saat query database atau proses lainnya
        console.error(`[CLOCK_OUT_ERROR] User ${userId}:`, error);
        if (error instanceof PrismaClientKnownRequestError) {
             // Cek jika error karena kolom tidak ada
             if (error.code === 'P2022') {
                 console.error("[CLOCK_OUT_ERROR] Prisma Error P2022: Column does not exist. Ensure migrations are applied.", error.meta);
                 return NextResponse.json({ success: false, message: 'Kesalahan konfigurasi database.', code: error.code }, { status: 500 });
             }
            return NextResponse.json({ success: false, message: 'Database error saat clock out.', code: error.code }, { status: 500 });
        }
        // Error umum lainnya
        const errorMessage = error instanceof Error ? error.message : 'Unknown system error during clock out.';
        return NextResponse.json({ success: false, message: `Terjadi kesalahan sistem saat clock out: ${errorMessage}` }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi
export const POST = withAuth(clockOutHandler);
