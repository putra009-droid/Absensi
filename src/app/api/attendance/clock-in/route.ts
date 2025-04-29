// src/app/api/attendance/clock-in/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// PERBAIKAN 1: Hapus PrismaClientKnownRequestError dari impor
import { Prisma, AttendanceStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';
import { getBatasTerlambat } from '@/lib/config';
// --- Impor Modul Node.js untuk File System ---
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
// --- Akhir Impor ---

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
    let selfieUrl: string | null = null;

    try {
        // Baca data sebagai FormData
        console.log(`[API Clock-In] User ${userId}: Attempting to read FormData...`);
        const formData = await request.formData();
        console.log(`[API Clock-In] User ${userId}: FormData received.`);

        const latString = formData.get('latitude') as string | null;
        const lonString = formData.get('longitude') as string | null;
        if (latString && !isNaN(parseFloat(latString))) { latitude = new Prisma.Decimal(parseFloat(latString)); }
        if (lonString && !isNaN(parseFloat(lonString))) { longitude = new Prisma.Decimal(parseFloat(lonString)); }
        console.log(`[API Clock-In] User ${userId} location from FormData: Lat=${latitude}, Long=${longitude}`);

        const selfieField = formData.get('selfie');
        if (selfieField instanceof File) {
            selfieFile = selfieField;
            console.log(`[API Clock-In] User ${userId} sent a selfie file: Name=${selfieFile.name}, Size=${selfieFile.size}, Type=${selfieFile.type}`);

            // Logika Penyimpanan File Lokal
            try {
                const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());
                const timestamp = Date.now();
                const fileExtension = selfieFile.name.split('.').pop() || 'jpg';
                const uniqueFileName = `clockin-${userId}-${timestamp}.${fileExtension}`;
                const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockin');
                const filePath = path.join(uploadDir, uniqueFileName);
                await mkdir(uploadDir, { recursive: true });
                await writeFile(filePath, fileBuffer);
                console.log(`[API Clock-In] Selfie file saved to: ${filePath}`);
                selfieUrl = `/uploads/selfies/clockin/${uniqueFileName}`;
                console.log(`[API Clock-In] Relative Selfie URL set to: ${selfieUrl}`);
            } catch (uploadError) {
                console.error(`[API Clock-In] User ${userId}: Failed to save selfie file!`, uploadError);
                selfieUrl = null;
            }
        } else if (selfieField) {
             console.warn(`[API Clock-In] User ${userId}: 'selfie' field received but is not a File. Type: ${typeof selfieField}`);
        } else {
            console.log(`[API Clock-In] User ${userId} did not send a 'selfie' file.`);
        }

    } catch (e) {
        console.error(`[API Clock-In] User ${userId}: Error reading FormData.`, e);
    }

    try {
        // Cek absensi yang sudah ada
        const existingRecord = await prisma.attendanceRecord.findFirst({
            where: {
                userId: userId, clockIn: { gte: todayStart },
                status: { in: [ AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT, AttendanceStatus.SELESAI, AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI ] }
            }, select: { status: true }
        });
        if (existingRecord) { return NextResponse.json( { success: false, message: `Anda sudah tercatat ${existingRecord.status} hari ini.` }, { status: 409 } ); }

        // Penentuan status awal
        const batasTerlambat = getBatasTerlambat(now);
        const initialStatus = now > batasTerlambat ? AttendanceStatus.TERLAMBAT : AttendanceStatus.HADIR;
        console.log(`[API Clock-In] User ${userId} - Initial Status Determined: ${initialStatus}`);

        // Buat record baru
        const newRecord = await prisma.attendanceRecord.create({
            data: {
                userId: userId,
                clockIn: now,
                status: initialStatus,
                latitudeIn: latitude,
                longitudeIn: longitude,
                selfieInUrl: selfieUrl
            },
            select: {
                id: true, clockIn: true, status: true,
                latitudeIn: true, longitudeIn: true, selfieInUrl: true
            }
        });

        console.log(`[API Clock-In] User ${userId} clocked in successfully. Record ID: ${newRecord.id}, Status Saved: ${newRecord.status}, Selfie URL: ${newRecord.selfieInUrl}`);

        // Kirim respons sukses
        return NextResponse.json({
            success: true, message: 'Clock in berhasil!',
            data: {
                id: newRecord.id, status: newRecord.status,
                clockIn: newRecord.clockIn.toISOString(),
                latitudeIn: newRecord.latitudeIn !== null ? Number(newRecord.latitudeIn) : null,
                longitudeIn: newRecord.longitudeIn !== null ? Number(newRecord.longitudeIn) : null,
                selfieUrl: newRecord.selfieInUrl
            }
        }, { status: 201 });

    // PERBAIKAN 2: Penanganan error 'unknown'
    } catch (error: unknown) {
        console.error(`[CLOCK_IN_ERROR] User ${userId}:`, error);

        let errorMessage = 'Terjadi kesalahan sistem saat clock in.'; // Default
        let errorCode: string | undefined = undefined;

        // Gunakan Prisma.PrismaClientKnownRequestError
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            errorMessage = `Database error saat clock in: ${error.message}`;
            errorCode = error.code;
            // Cek kode spesifik jika perlu
            if (error.code === 'P2022') { /* ... error handling spesifik P2022 ... */ }
            // Kembalikan error DB
            return NextResponse.json({ success: false, message: errorMessage, code: errorCode }, { status: 500 });
        } else if (error instanceof Error) { // Tangani error JS standar
            errorMessage = error.message;
        }
        // Kembalikan error umum
        return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi (tetap sama)
export const POST = withAuth(clockInHandler);