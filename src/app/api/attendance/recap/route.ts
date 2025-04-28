// src/app/api/attendance/recap/route.ts
import { NextResponse } from 'next/server';
import { getRekapBulanan, RekapBulan } from '@/lib/attendanceLogic'; // Asumsi path benar
import { Prisma } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // <-- Import

// Handler asli
const getRecapHandler = async (request: AuthenticatedRequest) => { // <-- Gunakan AuthenticatedRequest
    const userId = request.user?.id; // <-- Ambil userId dari token
    if (!userId) return NextResponse.json({ message: 'ID Pengguna tidak valid.' }, { status: 401 });

    const { searchParams } = request.nextUrl; // <-- Gunakan request.nextUrl
    const now = new Date();
    const targetYear = parseInt(searchParams.get('tahun') || '', 10) || now.getFullYear();
    let targetMonth = parseInt(searchParams.get('bulan') || '', 10); // Bulan diterima sebagai 1-12 ? atau 0-11? Asumsi 0-11
    if (isNaN(targetMonth) || targetMonth < 0 || targetMonth > 11) { targetMonth = now.getMonth(); }

    try {
        const rekap: RekapBulan = await getRekapBulanan(userId, targetYear, targetMonth);

        // --- SERIALISASI HASIL REKAP ---
        const serializableRekap = {
            totalHadir: rekap.totalHadir, totalTerlambat: rekap.totalTerlambat,
            totalAlpha: rekap.totalAlpha, totalHariKerja: rekap.totalHariKerja,
            detailPerHari: rekap.detailPerHari.map(detail => ({
                ...detail,
                tanggal: detail.tanggal.toISOString(),
                clockIn: detail.clockIn ? detail.clockIn.toISOString() : null,
                clockOut: detail.clockOut ? detail.clockOut.toISOString() : null,
                latitudeIn: detail.latitudeIn !== null ? Number(detail.latitudeIn) : null,
                longitudeIn: detail.longitudeIn !== null ? Number(detail.longitudeIn) : null,
                latitudeOut: detail.latitudeOut !== null ? Number(detail.latitudeOut) : null,
                longitudeOut: detail.longitudeOut !== null ? Number(detail.longitudeOut) : null,
            }))
        };

        console.log(`[API Recap] User ${userId} requesting recap for ${targetYear}-${targetMonth + 1}`);
        return NextResponse.json(serializableRekap);

    } catch (error: any) {
        console.error(`[API Recap Error] User ${userId} for ${targetYear}-${targetMonth + 1}:`, error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return NextResponse.json({ message: `Database error: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ message: 'Gagal mengambil rekap bulanan karena kesalahan server.' }, { status: 500 });
    }
};

// Bungkus handler dengan withAuth
export const GET = withAuth(getRecapHandler);