// src/app/api/attendance/clock-out/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Import tipe dan enum yang diperlukan
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Prisma, AttendanceStatus } from '@prisma/client';
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
        const formData = await request.formData();
        console.log(`[API Clock-Out] User ${userId}: FormData read successfully.`);

        const latString = formData.get('latitude') as string | null;
        const lonString = formData.get('longitude') as string | null;
        if (latString && !isNaN(parseFloat(latString))) { latitude = new Prisma.Decimal(parseFloat(latString)); }
        if (lonString && !isNaN(parseFloat(lonString))) { longitude = new Prisma.Decimal(parseFloat(lonString)); }
        console.log(`[API Clock-Out] User ${userId} location from FormData: Lat=${latitude}, Long=${longitude}`);

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

                const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockout'); // Folder clockout
                const filePath = path.join(uploadDir, uniqueFileName);
                console.log(`[API Clock-Out] Attempting to save selfie to: ${filePath}`);

                await mkdir(uploadDir, { recursive: true });
                await writeFile(filePath, fileBuffer);
                console.log(`[API Clock-Out] Selfie file saved successfully.`);

                selfieUrl = `/uploads/selfies/clockout/${uniqueFileName}`; // Path relatif clock-out
                console.log(`[API Clock-Out] Relative Selfie URL set to: ${selfieUrl}`);

            } catch (uploadError) {
                console.error(`[API Clock-Out] User ${userId}: Failed to save selfie file!`, uploadError);
                selfieUrl = null;
            }
            // --- Akhir Logika Penyimpanan File ---

        } else if (selfieField) {
             console.warn(`[API Clock-Out] User ${userId}: 'selfie' field received but is not a File. Type: ${typeof selfieField}`);
        } else {
            console.log(`[API Clock-Out] User ${userId} did not send a 'selfie' file.`);
        }

    } catch (e) {
        console.error(`[API Clock-Out] User ${userId}: CRITICAL Error reading FormData!`, e);
        return NextResponse.json({ success: false, message: 'Gagal memproses data request (FormData).' }, { status: 400 });
    }

    try {
        // Cari record absensi yang aktif
        console.log(`[API Clock-Out] Mencari record aktif untuk user: ${userId}`);
        const activeRecord = await prisma.attendanceRecord.findFirst({
            where: {
                userId: userId,
                clockIn: { gte: todayStart },
                clockOut: null,
                status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT] }
            },
            orderBy: { clockIn: 'desc' }
        });
        console.log(`[API Clock-Out] User ${userId} - Hasil pencarian record aktif:`, activeRecord ? activeRecord.id : 'Not Found');

        if (!activeRecord) {
            console.warn(`[API Clock-Out] Record aktif tidak ditemukan untuk user: ${userId}`);
            return NextResponse.json(
                { success: false, message: 'Tidak ada absensi aktif (status HADIR/TERLAMBAT) yang ditemukan untuk di-clock-out hari ini.' },
                { status: 404 }
            );
        }

        // Update record absensi yang aktif
        console.log(`[API Clock-Out] User ${userId} - Mengupdate record ID: ${activeRecord.id}`);
        const updatedRecord = await prisma.attendanceRecord.update({
            where: { id: activeRecord.id },
            data: {
                clockOut: now,
                status: AttendanceStatus.SELESAI,
                latitudeOut: latitude,
                longitudeOut: longitude,
                selfieOutUrl: selfieUrl
            },
            select: {
                id: true,
                clockIn: true,
                clockOut: true,
                status: true,
                latitudeOut: true,
                longitudeOut: true,
                selfieOutUrl: true
            }
        });

        console.log(`[API Clock-Out] User ${userId} clocked out successfully. Record ID: ${updatedRecord.id}, Status: ${updatedRecord.status}, Selfie URL: ${updatedRecord.selfieOutUrl}`);

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
                selfieUrl: updatedRecord.selfieOutUrl
            }
        });

    // PERBAIKAN 2: Penanganan error 'unknown'
    } catch (error: unknown) {
        console.error(`[CLOCK_OUT_ERROR] User ${userId}:`, error);

        let errorMessage = 'Terjadi kesalahan sistem saat clock out.'; // Default
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error saat clock out: ${error.message}`;
            errorCode = error.code;
            // Cek jika error karena kolom tidak ada (P2022)
             if (error.code === 'P2022') {
                 // Akses error.meta aman di sini karena sudah cek instanceof
                 console.error("[CLOCK_OUT_ERROR] Prisma Error P2022: Column does not exist. Ensure migrations are applied.", (error as any).meta); // Casting ke any untuk akses meta jika perlu
                 errorMessage = 'Kesalahan konfigurasi database.';
                 return NextResponse.json({ success: false, message: errorMessage, code: errorCode }, { status: 500 });
             }
            // Error Prisma lain
            return NextResponse.json({ success: false, message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) { // Tangani error JS standar
            errorMessage = error.message;
        }
        // Kembalikan error umum
        return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi (tetap sama)
export const POST = withAuth(clockOutHandler);