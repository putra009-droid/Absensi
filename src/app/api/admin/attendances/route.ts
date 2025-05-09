// File: src/app/api/admin/attendances/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// Impor tipe dan fungsi dari authMiddleware Anda
import { withAuth, AuthenticatedRequest, RouteContext } from '@/lib/authMiddleware'; 
import { Role, AttendanceStatus, Prisma } from '@prisma/client';

// Handler utama untuk GET request, sekarang menerima context
async function getAttendancesHandler(req: AuthenticatedRequest, context: RouteContext) { 
  // req.user akan tersedia di sini jika autentikasi berhasil
  // console.log('User making request:', req.user);

  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const userIdParam = searchParams.get('userId');
  const startDateString = searchParams.get('startDate');
  const endDateString = searchParams.get('endDate');
  const statusQuery = searchParams.get('status');

  const skip = (page - 1) * limit;

  try {
    const whereClause: Prisma.AttendanceRecordWhereInput = {}; 
    if (userIdParam) {
      whereClause.userId = userIdParam;
    }

    if (statusQuery && Object.values(AttendanceStatus).includes(statusQuery as AttendanceStatus)) {
      whereClause.status = statusQuery as AttendanceStatus;
    } else if (statusQuery) {
      console.warn(`[ADMIN GET ATTENDANCES] Status filter tidak valid diterima: ${statusQuery}`);
      // Anda bisa memilih untuk mengabaikan filter status yang tidak valid atau mengembalikan error
      // return NextResponse.json({ error: `Status filter '${statusQuery}' tidak valid.` }, { status: 400 });
    }

    if (startDateString) {
      const startDate = new Date(startDateString);
      startDate.setUTCHours(0, 0, 0, 0); 
      if (!whereClause.clockIn) {
        whereClause.clockIn = {};
      }
      (whereClause.clockIn as Prisma.DateTimeFilter<'AttendanceRecord'>).gte = startDate;
    }

    if (endDateString) {
      const endDate = new Date(endDateString);
      endDate.setUTCHours(23, 59, 59, 999); 
      if (!whereClause.clockIn) {
        whereClause.clockIn = {};
      }
      (whereClause.clockIn as Prisma.DateTimeFilter<'AttendanceRecord'>).lte = endDate;
    }
    
    if (startDateString && !endDateString && whereClause.clockIn) {
        const date = new Date(startDateString);
        const gteDate = new Date(date);
        gteDate.setUTCHours(0,0,0,0);
        const lteDate = new Date(date);
        lteDate.setUTCHours(23,59,59,999);
        
        whereClause.clockIn = {
            gte: gteDate,
            lte: lteDate,
        };
    }

    console.log('[ADMIN GET ATTENDANCES] Query Where Clause:', JSON.stringify(whereClause, null, 2));

    const attendances = await prisma.attendanceRecord.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: {
        clockIn: 'desc',
      },
      include: {
        user: { 
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const totalAttendances = await prisma.attendanceRecord.count({
      where: whereClause,
    });

    const totalPages = Math.ceil(totalAttendances / limit);

    return NextResponse.json({
      message: 'Data absensi berhasil diambil',
      data: attendances,
      currentPage: page,
      totalPages: totalPages,
      totalItems: totalAttendances,
    });

  } catch (error: unknown) {
    console.error('[ADMIN GET ATTENDANCES ERROR]', error);
    let errorMessage = 'Terjadi kesalahan server saat mengambil data absensi.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Export fungsi GET yang sudah diproteksi oleh withAuth
// PERHATIAN: Middleware Anda sekarang hanya menerima SATU requiredRole.
// Jika Anda ingin SUPER_ADMIN DAN YAYASAN bisa mengakses, middleware perlu diubah
// untuk menerima array Role. Untuk saat ini, saya akan set ke SUPER_ADMIN.
// Jika tidak ada role spesifik (hanya autentikasi), Anda bisa menghapus argumen kedua.
export const GET = withAuth(getAttendancesHandler, Role.SUPER_ADMIN);
