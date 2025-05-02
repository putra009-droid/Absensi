// src/app/api/attendance/clock-in/route.ts
// Dengan perbaikan await saat memanggil getBatasTerlambat

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, AttendanceStatus } from '@prisma/client'; // Import Prisma namespace
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Pastikan path benar
// Import getBatasTerlambat dari lokasi yang benar
import { getBatasTerlambat } from '@/lib/config'; // atau '@/lib/attendanceLogic'
// --- Impor Modul Node.js untuk File System ---
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
// --- Akhir Impor ---

// Handler POST untuk Clock In
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
                const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());
                const timestamp = Date.now();
                const fileExtension = selfieFile.name.split('.').pop() || 'jpg';
                const uniqueFileName = `clockin-${userId}-${timestamp}.${fileExtension}`;
                const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'selfies', 'clockin');
                const filePath = path.join(uploadDir, uniqueFileName);

                await mkdir(uploadDir, { recursive: true });
                await writeFile(filePath, fileBuffer);
                console.log(`[API Clock-In] Selfie file saved to: ${filePath}`);

                // Set selfieUrl sebagai path relatif
                selfieUrl = `/uploads/selfies/clockin/${uniqueFileName}`;
                console.log(`[API Clock-In] Relative Selfie URL set to: ${selfieUrl}`);

            } catch (uploadError) {
                console.error(`[API Clock-In] User ${userId}: Failed to save selfie file!`, uploadError);
                selfieUrl = null; // Set null jika gagal
            }
            // --- Akhir Logika Penyimpanan File ---

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
                status: { in: [ AttendanceStatus.HADIR, AttendanceStatus.TERLAMBAT, AttendanceStatus.SELESAI, AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA ] }
            }, select: { status: true }
        });
        if (existingRecord) { return NextResponse.json( { success: false, message: `Anda sudah tercatat ${existingRecord.status} hari ini.` }, { status: 409 } ); }

        // ===> PERBAIKAN: Tambahkan await di sini <===
        // Penentuan status awal (HADIR/TERLAMBAT)
        const batasTerlambat = await getBatasTerlambat(now); // Tunggu hasil Promise<Date>
        // Sekarang batasTerlambat adalah Date, perbandingan bisa dilakukan
        const initialStatus = now > batasTerlambat ? AttendanceStatus.TERLAMBAT : AttendanceStatus.HADIR;
        // ===> AKHIR PERBAIKAN <===
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

    } catch (error) {
        console.error(`[CLOCK_IN_ERROR] User ${userId}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ success: false, message: 'Database error saat clock in.', code: error.code }, { status: 500 });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown system error during clock in.';
        return NextResponse.json({ success: false, message: `Terjadi kesalahan sistem saat clock in: ${errorMessage}` }, { status: 500 });
    }
};

// Bungkus handler dengan middleware autentikasi
export const POST = withAuth(clockInHandler); // Tidak perlu role spesifik
