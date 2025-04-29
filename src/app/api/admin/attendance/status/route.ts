// src/app/api/admin/attendance/status/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// PERBAIKAN: Hapus PrismaClientKnownRequestError dari impor ini
import { Role, Prisma, AttendanceStatus } from '@prisma/client';
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

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
             return NextResponse.json({ message: 'Format tanggal harus YYYY-MM-DD.' }, { status: 400 });
        }
        if (!Object.values(AttendanceStatus).includes(newStatus)) {
             return NextResponse.json({ message: `Status '${newStatus}' tidak valid.` }, { status: 400 });
        }
        const forbiddenManualStatus: AttendanceStatus[] = [AttendanceStatus.SELESAI, AttendanceStatus.BELUM, AttendanceStatus.TERLAMBAT, AttendanceStatus.HADIR];
        if (forbiddenManualStatus.includes(newStatus)) {
            return NextResponse.json({ message: `Admin tidak dapat mengatur status ke '${newStatus}' secara manual.` }, { status: 400 });
        }

        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: {id: true}});
        if (!userExists) {
             return NextResponse.json({ message: `User dengan ID '${userId}' tidak ditemukan.` }, { status: 404 });
        }

        // --- Logika Update / Create ---
        const targetDate = new Date(dateString);
        const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

        console.log(`[API POST /admin/attendance/status] Processing for User: ${userId}, Date: ${dateString}, Status: ${newStatus}, Range: ${startOfDay.toISOString()} - ${endOfDay.toISOString()}`);

        const existingRecord = await prisma.attendanceRecord.findFirst({
            where: {
                userId: userId,
                clockIn: {
                    gte: startOfDay,
                    lte: endOfDay,
                }
            }
        });

        // Definisikan array status yang akan men-null-kan data lain (fix dari error includes sebelumnya)
        const statusesToNullify: AttendanceStatus[] = [
            AttendanceStatus.IZIN,
            AttendanceStatus.SAKIT,
            AttendanceStatus.CUTI,
            AttendanceStatus.ALPHA
        ];

        let resultRecord;
        if (existingRecord) {
            // --- Update Record Yang Ada ---
            console.log(`[API POST /admin/attendance/status] Found existing record ID: ${existingRecord.id}, updating status to ${newStatus}`);
            resultRecord = await prisma.attendanceRecord.update({
                where: { id: existingRecord.id },
                data: {
                    status: newStatus,
                    notes: notes ?? existingRecord.notes,
                    // Gunakan array statusesToNullify
                    clockIn: statusesToNullify.includes(newStatus) ? startOfDay : existingRecord.clockIn,
                    clockOut: statusesToNullify.includes(newStatus) ? null : existingRecord.clockOut,
                    latitudeIn: statusesToNullify.includes(newStatus) ? null : existingRecord.latitudeIn,
                    longitudeIn: statusesToNullify.includes(newStatus) ? null : existingRecord.longitudeIn,
                    latitudeOut: statusesToNullify.includes(newStatus) ? null : existingRecord.latitudeOut,
                    longitudeOut: statusesToNullify.includes(newStatus) ? null : existingRecord.longitudeOut,
                },
                select: { id: true, userId: true, clockIn: true, status: true, notes: true }
            });
            console.log(`[API POST /admin/attendance/status] Record ${resultRecord.id} updated.`);

        } else {
            // --- Buat Record Baru ---
            console.log(`[API POST /admin/attendance/status] No existing record found for ${dateString}. Creating new record with status ${newStatus}`);
            resultRecord = await prisma.attendanceRecord.create({
                data: {
                    userId: userId,
                    status: newStatus,
                    notes: notes ?? null,
                    clockIn: startOfDay,
                    clockOut: null,
                    latitudeIn: null, longitudeIn: null,
                    latitudeOut: null, longitudeOut: null,
                },
                 select: { id: true, userId: true, clockIn: true, status: true, notes: true }
            });
            console.log(`[API POST /admin/attendance/status] New record ${resultRecord.id} created.`);
        }

        // Kirim respons sukses
        return NextResponse.json({
            message: `Status absensi untuk user ${userId} pada tanggal ${dateString} berhasil diatur ke ${newStatus}.`,
            record: resultRecord
        }, { status: existingRecord ? 200 : 201 });


    } catch (error: unknown) {
        console.error(`[API POST /admin/attendance/status] Error:`, error);
        // PERBAIKAN: Gunakan Prisma.PrismaClientKnownRequestError
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