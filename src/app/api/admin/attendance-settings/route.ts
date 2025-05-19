// File Lokasi: src/app/api/admin/attendance-settings/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma'; // Sesuaikan path ke prisma client Anda
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Sesuaikan path
import { Role, Prisma } from '@prisma/client'; // Impor enum Role dan Prisma untuk tipe Decimal

const SETTINGS_ID = "global_settings"; // ID tetap untuk record AttendanceSetting

// Handler untuk GET request (mengambil pengaturan absensi)
const getAttendanceSettingsHandler = async (request: AuthenticatedRequest) => {
  // --- PERUBAHAN DI SINI ---
  // Pengecekan role SUPER_ADMIN untuk GET dihapus/dikomentari.
  // Sekarang semua pengguna yang terautentikasi (melalui withAuth) bisa mengambil pengaturan.
  // if (request.user?.role !== Role.SUPER_ADMIN) {
  //   return NextResponse.json({ success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang diizinkan.' }, { status: 403 });
  // }
  // --- AKHIR PERUBAHAN ---

  // Pastikan user terautentikasi (meskipun role tidak lagi dicek di sini untuk GET)
  if (!request.user?.id) {
    return NextResponse.json({ success: false, message: 'Tidak terautentikasi.' }, { status: 401 });
  }

  try {
    let settings = await prisma.attendanceSetting.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!settings) {
      console.log(`[API AttendanceSettings] Pengaturan tidak ditemukan, membuat record default dengan ID: ${SETTINGS_ID}`);
      settings = await prisma.attendanceSetting.create({
        data: {
          id: SETTINGS_ID,
          // Nilai default akan diambil dari skema Prisma
        },
      });
      console.log(`[API AttendanceSettings] Record default berhasil dibuat.`);
    }

    const responseData = {
      ...settings,
      targetLatitude: settings.targetLatitude !== null ? Number(settings.targetLatitude) : null,
      targetLongitude: settings.targetLongitude !== null ? Number(settings.targetLongitude) : null,
    };

    return NextResponse.json({ success: true, data: responseData });
  } catch (error) {
    console.error('[API GET_ATTENDANCE_SETTINGS_ERROR]', error);
    return NextResponse.json({ success: false, message: 'Gagal mengambil pengaturan absensi.' }, { status: 500 });
  }
};

// Handler untuk POST request (memperbarui pengaturan absensi)
const updateAttendanceSettingsHandler = async (request: AuthenticatedRequest) => {
  // Pengecekan role SUPER_ADMIN untuk POST (update) TETAP ADA
  if (request.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang diizinkan untuk memperbarui.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      workStartTimeHour,
      workStartTimeMinute,
      lateToleranceMinutes,
      workEndTimeHour,
      workEndTimeMinute,
      isLocationLockActive,
      targetLatitude: bodyTargetLatitude,
      targetLongitude: bodyTargetLongitude,
      allowedRadiusMeters: bodyAllowedRadiusMeters,
    } = body;

    // Validasi input (seperti sebelumnya)
    if (
      typeof workStartTimeHour !== 'number' || workStartTimeHour < 0 || workStartTimeHour > 23 ||
      typeof workStartTimeMinute !== 'number' || workStartTimeMinute < 0 || workStartTimeMinute > 59 ||
      typeof lateToleranceMinutes !== 'number' || lateToleranceMinutes < 0 ||
      typeof workEndTimeHour !== 'number' || workEndTimeHour < 0 || workEndTimeHour > 23 ||
      typeof workEndTimeMinute !== 'number' || workEndTimeMinute < 0 || workEndTimeMinute > 59 ||
      typeof isLocationLockActive !== 'boolean'
    ) {
      return NextResponse.json({
        success: false,
        message: 'Data jam, menit, toleransi, atau status lock lokasi tidak valid.',
      }, { status: 400 });
    }

    if (isLocationLockActive === true) {
      if (
        bodyTargetLatitude === null || bodyTargetLatitude === undefined || typeof bodyTargetLatitude !== 'number' || bodyTargetLatitude < -90 || bodyTargetLatitude > 90 ||
        bodyTargetLongitude === null || bodyTargetLongitude === undefined || typeof bodyTargetLongitude !== 'number' || bodyTargetLongitude < -180 || bodyTargetLongitude > 180 ||
        bodyAllowedRadiusMeters === null || bodyAllowedRadiusMeters === undefined || typeof bodyAllowedRadiusMeters !== 'number' || bodyAllowedRadiusMeters <= 0
      ) {
        return NextResponse.json({
          success: false,
          message: 'Jika lock lokasi aktif, Latitude (-90 to 90), Longitude (-180 to 180), dan Radius (harus > 0) wajib diisi dengan benar.',
        }, { status: 400 });
      }
    }
    
    let finalTargetLatitude: Prisma.Decimal | null = null;
    let finalTargetLongitude: Prisma.Decimal | null = null;
    let finalAllowedRadiusMeters: number | null = null;

    if (isLocationLockActive === true) {
      finalTargetLatitude = new Prisma.Decimal(Number(bodyTargetLatitude).toFixed(6));
      finalTargetLongitude = new Prisma.Decimal(Number(bodyTargetLongitude).toFixed(6));
      finalAllowedRadiusMeters = parseInt(String(bodyAllowedRadiusMeters));
    }
    
    const dataForOperation = {
        workStartTimeHour,
        workStartTimeMinute,
        lateToleranceMinutes,
        workEndTimeHour,
        workEndTimeMinute,
        isLocationLockActive,
        targetLatitude: finalTargetLatitude,
        targetLongitude: finalTargetLongitude,
        allowedRadiusMeters: finalAllowedRadiusMeters,
    };

    const updatedSettings = await prisma.attendanceSetting.upsert({
      where: { id: SETTINGS_ID },
      update: dataForOperation,
      create: {
        id: SETTINGS_ID,
        ...dataForOperation,
      },
    });

    const responseData = {
      ...updatedSettings,
      targetLatitude: updatedSettings.targetLatitude !== null ? Number(updatedSettings.targetLatitude) : null,
      targetLongitude: updatedSettings.targetLongitude !== null ? Number(updatedSettings.targetLongitude) : null,
    };

    return NextResponse.json({
      success: true,
      message: 'Pengaturan absensi berhasil diperbarui!',
      data: responseData,
    });
  } catch (error: any) {
    console.error('[API UPDATE_ATTENDANCE_SETTINGS_ERROR]', error);
    if (error instanceof Prisma.PrismaClientValidationError || error.code === 'P2009' || error.code === 'P2025' || error.code === 'P2012') {
        return NextResponse.json({ success: false, message: 'Data input tidak valid, field wajib mungkin kosong atau tipe tidak sesuai.' }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: 'Gagal memperbarui pengaturan absensi.' }, { status: 500 });
  }
};

export const GET = withAuth(getAttendanceSettingsHandler as any);
export const POST = withAuth(updateAttendanceSettingsHandler as any);
