// src/app/api/admin/attendance/status/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, AttendanceStatus } from '@prisma/client'; // Import Enum Status
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Import helper auth

// Interface untuk ekspektasi body request
interface SetStatusRequestBody {
    userId: string;
    date: string; // Format YYYY-MM-DD
    status: AttendanceStatus; // Harus salah satu dari Enum AttendanceStatus
    notes?: string; // Opsional
}

// =====================================================================
// === FUNGSI POST (Untuk Set/Update Status Absensi oleh Admin)      ===
// =====================================================================
const setAttendanceStatusHandler = async (request: AuthenticatedRequest) => {
    const adminUserId = request.user?.id; // Admin yang melakukan aksi
    console.log(`[API POST /admin/attendance/status] Request by Admin: ${adminUserId}`);

    let body: SetStatusRequestBody;
    try {
        body = await request.json();
        const { userId, date: dateString, status: newStatus, notes } = body;

        // --- Validasi Input ---
        if (!userId || !dateString || !newStatus) {
            return NextResponse.json({ message: 'userId, date (YYYY-MM-DD), dan status wajib diisi.' }, { status: 400 });
        }

        // Validasi format tanggal (basic)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
             return NextResponse.json({ message: 'Format tanggal harus YYYY-MM-DD.' }, { status: 400 });
        }
        // Validasi nilai status enum
        if (!Object.values(AttendanceStatus).includes(newStatus)) {
             return NextResponse.json({ message: `Status '${newStatus}' tidak valid.` }, { status: 400 });
        }
        // Admin mungkin tidak boleh set status tertentu secara manual?
        const forbiddenManualStatus: AttendanceStatus[] = [AttendanceStatus.SELESAI, AttendanceStatus.BELUM, AttendanceStatus.TERLAMBAT, AttendanceStatus.HADIR]; // Contoh: Admin hanya boleh set Izin, Sakit, Cuti, Alpha
        if (forbiddenManualStatus.includes(newStatus)) {
            return NextResponse.json({ message: `Admin tidak dapat mengatur status ke '${newStatus}' secara manual.` }, { status: 400 });
        }

        // Cek apakah User ada
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: {id: true}});
        if (!userExists) {
             return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
        }

        // --- Logika Update / Create ---
        // Tentukan rentang tanggal (hati-hati timezone!)
        // Asumsi 'dateString' adalah tanggal lokal server. Buat objek Date.
        // new Date('YYYY-MM-DD') akan membuat tanggal di UTC midnight.
        // Untuk query lokal, lebih aman buat start dan end secara eksplisit.
        // Ini mengasumsikan server dan input berada di timezone yang sama.
        const targetDate = new Date(dateString); // Mungkin perlu penyesuaian timezone lebih lanjut jika server UTC
        const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

        console.log(`[API POST /admin/attendance/status] Processing for User: ${userId}, Date: ${dateString}, Status: ${newStatus}, Range: ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);

        // Cari record yang ada untuk user dan tanggal ini
        const existingRecord = await prisma.attendanceRecord.findFirst({
            where: {
                userId: userId,
                // Cari berdasarkan rentang tanggal, clockIn bisa jadi acuan utama
                clockIn: {
                    gte: startOfDay,
                    lte: endOfDay,
                }
            }
        });

        let resultRecord;
        if (existingRecord) {
            // --- Update Record Yang Ada ---
            console.log(`[API POST /admin/attendance/status] Found existing record ID: ${existingRecord.id}, updating status to ${newStatus}`);
            resultRecord = await prisma.attendanceRecord.update({
                where: { id: existingRecord.id },
                data: {
                    status: newStatus,
                    notes: notes ?? existingRecord.notes, // Update notes jika ada, jika tidak pakai yg lama
                    // Kosongkan data jam & lokasi jika statusnya Izin/Sakit/Cuti/Alpha
                    clockIn: [AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA].includes(newStatus) ? startOfDay : existingRecord.clockIn, // Set ke awal hari jika leave/alpha, else pertahankan
                    clockOut: [AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA].includes(newStatus) ? null : existingRecord.clockOut,
                    latitudeIn: [AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA].includes(newStatus) ? null : existingRecord.latitudeIn,
                    longitudeIn: [AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA].includes(newStatus) ? null : existingRecord.longitudeIn,
                    latitudeOut: [AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA].includes(newStatus) ? null : existingRecord.latitudeOut,
                    longitudeOut: [AttendanceStatus.IZIN, AttendanceStatus.SAKIT, AttendanceStatus.CUTI, AttendanceStatus.ALPHA].includes(newStatus) ? null : existingRecord.longitudeOut,
                },
                select: { id: true, userId: true, clockIn: true, status: true, notes: true } // Pilih data yg dikembalikan
            });
            console.log(`[API POST /admin/attendance/status] Record ${resultRecord.id} updated.`);

        } else {
            // --- Buat Record Baru ---
            console.log(`[API POST /admin/attendance/status] No existing record found for ${dateString}. Creating new record with status ${newStatus}`);
            // Gunakan startOfDay sebagai 'clockIn' agar bisa diquery berdasarkan tanggal
            resultRecord = await prisma.attendanceRecord.create({
                data: {
                    userId: userId,
                    status: newStatus,
                    notes: notes ?? null,
                    clockIn: startOfDay, // Penting untuk query tanggal
                    clockOut: null,
                    latitudeIn: null, longitudeIn: null,
                    latitudeOut: null, longitudeOut: null,
                },
                 select: { id: true, userId: true, clockIn: true, status: true, notes: true } // Pilih data yg dikembalikan
            });
            console.log(`[API POST /admin/attendance/status] New record ${resultRecord.id} created.`);
        }

        // Kirim respons sukses
        return NextResponse.json({
            message: `Status absensi untuk user ${userId} pada tanggal ${dateString} berhasil diatur ke ${newStatus}.`,
            record: resultRecord
        }, { status: existingRecord ? 200 : 201 }); // 200 jika Update, 201 jika Create


    } catch (error: unknown) {
        console.error(`[API POST /admin/attendance/status] Error:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            // Handle error spesifik Prisma
            return NextResponse.json({ message: `Database error: ${error.message}`, code: error.code }, { status: 500 });
        }
        if (error instanceof SyntaxError) { // Body JSON tidak valid
           return NextResponse.json({ message: 'Format body request tidak valid (JSON).' }, { status: 400 });
        }
        // Error umum lainnya
        return NextResponse.json({ message: 'Gagal mengatur status absensi karena kesalahan server.' }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth dan role SUPER_ADMIN
export const POST = withAuth(setAttendanceStatusHandler, Role.SUPER_ADMIN);