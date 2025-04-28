// src/app/api/attendance/status-harian/route.ts
import { NextResponse } from 'next/server';
import { getStatusHarian } from '@/lib/attendanceLogic'; // Asumsi path benar
import { Prisma, AttendanceStatus } from '@prisma/client'; // Role mungkin tidak perlu di sini
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import

// Handler asli
const getStatusHandler = async (request: AuthenticatedRequest) => { // <-- Gunakan AuthenticatedRequest
    const userId = request.user?.id; // <-- Ambil userId dari token
    if (!userId) return NextResponse.json({ success: false, message: 'ID Pengguna tidak valid.' }, { status: 401 });

    try {
        const { searchParams } = request.nextUrl; // <-- Gunakan request.nextUrl
        const dateParam = searchParams.get('date');

        let targetDate: Date;
        try {
            targetDate = dateParam ? new Date(dateParam) : new Date();
            if (isNaN(targetDate.getTime())) { throw new Error('Invalid date format'); }
            targetDate.setHours(0, 0, 0, 0); // Normalisasi ke awal hari
        } catch (error) {
            return NextResponse.json(
                { success: false, message: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD' },
                { status: 400 }
            );
        }

        const statusHarian = await getStatusHarian(userId, targetDate);

        // Validasi dasar respons dari getStatusHarian
        if (!statusHarian || !(statusHarian.tanggal instanceof Date)) {
             console.error(`[API Status Harian] Invalid response from getStatusHarian for User ${userId} on ${targetDate.toISOString().split('T')[0]}:`, statusHarian);
             return NextResponse.json({ success: false, message: 'Gagal memproses data absensi.' }, { status: 500 });
        }

        const responseData = {
            success: true,
            data: {
                ...statusHarian,
                tanggal: statusHarian.tanggal.toISOString(),
                clockIn: statusHarian.clockIn?.toISOString() ?? null,
                clockOut: statusHarian.clockOut?.toISOString() ?? null,
                // Konversi Decimal ke String atau Number sesuai kebutuhan klien mobile
                latitudeIn: statusHarian.latitudeIn?.toString() ?? null,
                longitudeIn: statusHarian.longitudeIn?.toString() ?? null,
                latitudeOut: statusHarian.latitudeOut?.toString() ?? null,
                longitudeOut: statusHarian.longitudeOut?.toString() ?? null,
            }
        };
        console.log(`[API Status Harian] User ${userId} requesting status for ${targetDate.toISOString().split('T')[0]}`);
        return NextResponse.json(responseData);

    } catch (error) {
        console.error(`[API Status Harian Error] User ${userId}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ success: false, message: 'Database error.', code: error.code }, { status: 500 });
        }
        return NextResponse.json(
            { success: false, message: 'Terjadi kesalahan server.', error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
};

// Bungkus handler dengan withAuth
export const GET = withAuth(getStatusHandler);