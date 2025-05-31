// File: src/app/api/admin/reports/attendance/monthly/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, Prisma, AttendanceStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest, RouteContext } from '@/lib/authMiddleware';
// Pastikan RekapBulan dan DetailAbsensiHarian (dengan tipe Date dan Prisma.Decimal) di-export dari attendanceLogic
import { getRekapBulanan, RekapBulan, DetailAbsensiHarian, StatusAbsensiHarian } from '@/lib/attendanceLogic';

// Interface untuk DetailAbsensiHarian setelah serialisasi (tanggal & decimal menjadi string)
interface SerializedDetailAbsensiHarian {
    tanggal: string;
    status: StatusAbsensiHarian;
    clockIn: string | null;
    clockOut: string | null;
    latitudeIn: string | null;
    longitudeIn: string | null;
    latitudeOut: string | null;
    longitudeOut: string | null;
    notes?: string | null;
}

// Interface untuk RekapBulan setelah serialisasi
interface SerializedRekapBulan {
    totalHadir: number;
    totalTerlambat: number;
    totalAlpha: number;
    totalIzin?: number;
    totalSakit?: number;
    totalCuti?: number;
    totalHariKerja: number;
    detailPerHari: SerializedDetailAbsensiHarian[];
}

// Interface untuk struktur respons API akhir
interface MonthlyAttendanceReportResponse {
  year: number;
  month: number; // Ini akan menjadi 0-11 (Januari=0, dst.)
  reportGeneratedAt: string;
  data: Array<{
    userId: string;
    userName: string | null;
    userEmail: string;
    recap: SerializedRekapBulan | null; // Menggunakan tipe yang sudah diserialisasi
    error?: string;
  }>;
}

// Fungsi untuk serialisasi DetailAbsensiHarian
const serializeDetailHarianForReport = (detail: DetailAbsensiHarian): SerializedDetailAbsensiHarian => ({
    tanggal: detail.tanggal.toISOString(),
    status: detail.status,
    clockIn: detail.clockIn?.toISOString() ?? null,
    clockOut: detail.clockOut?.toISOString() ?? null,
    latitudeIn: detail.latitudeIn?.toString() ?? null,
    longitudeIn: detail.longitudeIn?.toString() ?? null,
    latitudeOut: detail.latitudeOut?.toString() ?? null,
    longitudeOut: detail.longitudeOut?.toString() ?? null,
    notes: detail.notes ?? null,
});

// Fungsi untuk serialisasi RekapBulan
const serializeRekapBulanForReport = (rekap: RekapBulan | null): SerializedRekapBulan | null => {
    if (!rekap) return null;
    return {
        totalHadir: rekap.totalHadir,
        totalTerlambat: rekap.totalTerlambat,
        totalAlpha: rekap.totalAlpha,
        totalIzin: rekap.totalIzin,
        totalSakit: rekap.totalSakit,
        totalCuti: rekap.totalCuti,
        totalHariKerja: rekap.totalHariKerja,
        detailPerHari: rekap.detailPerHari.map(serializeDetailHarianForReport),
    };
};

// Handler untuk GET request laporan absensi bulanan
const getMonthlyReportHandler = async (request: AuthenticatedRequest, context: RouteContext) => {
  const adminUserId = request.user?.id;
  console.log(`[API GET Monthly Attendance Report] Request by Admin: ${adminUserId}`);

  const { searchParams } = request.nextUrl;
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month'); // Frontend sebaiknya mengirim bulan sebagai 1-12

  if (!yearParam || !monthParam) {
    return NextResponse.json({ message: 'Parameter "year" dan "month" (1-12) wajib diisi.' }, { status: 400 });
  }

  const year = parseInt(yearParam, 10);
  // Konversi bulan dari 1-12 (dari query) ke 0-11 (untuk JavaScript Date object dan getRekapBulanan)
  const monthIndex = parseInt(monthParam, 10) - 1;

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ message: 'Parameter "year" tidak valid.' }, { status: 400 });
  }
  if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return NextResponse.json({ message: 'Parameter "month" (1-12) tidak valid.' }, { status: 400 });
  }

  try {
    // 1. Ambil semua pengguna yang relevan (misalnya, semua EMPLOYEE)
    // Anda bisa menyesuaikan filter ini jika diperlukan
    const users = await prisma.user.findMany({
      where: {
        role: Role.EMPLOYEE,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (users.length === 0) {
      return NextResponse.json({ message: 'Tidak ada pengguna yang ditemukan untuk laporan.' }, { status: 404 });
    }

    // 2. Untuk setiap pengguna, dapatkan rekap bulanannya
    const reportData: MonthlyAttendanceReportResponse['data'] = [];

    for (const user of users) {
      try {
        // getRekapBulanan diharapkan mengembalikan RekapBulan dengan Date dan Prisma.Decimal
        const userRekap: RekapBulan | null = await getRekapBulanan(user.id, year, monthIndex);
        reportData.push({
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          // Serialisasi dilakukan di sini, hasilnya akan cocok dengan SerializedRekapBulan
          recap: serializeRekapBulanForReport(userRekap),
        });
      } catch (rekapError: any) {
        console.error(`[API GET Monthly Report] Error generating recap for user ${user.id} (${user.email}):`, rekapError);
        reportData.push({
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          recap: null,
          error: `Gagal menghasilkan rekap: ${rekapError.message || 'Kesalahan tidak diketahui'}`
        });
      }
    }

    // Konstruksi objek respons akhir dengan tipe MonthlyAttendanceReportResponse
    const response: MonthlyAttendanceReportResponse = {
      year: year,
      month: monthIndex, // Mengembalikan bulan sebagai 0-11 (Jan-Des)
      reportGeneratedAt: new Date().toISOString(),
      data: reportData,
    };

    return NextResponse.json(response);

  } catch (error: unknown) {
    console.error('[API GET Monthly Attendance Report] Overall Error:', error);
    let errorMessage = 'Gagal menghasilkan laporan absensi bulanan.';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorMessage = `Database error: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
};

// Bungkus handler dengan withAuth, misalnya hanya SUPER_ADMIN yang bisa akses
export const GET = withAuth(getMonthlyReportHandler, Role.SUPER_ADMIN);
