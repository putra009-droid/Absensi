// File Lokasi: src/app/api/admin/attendance-settings/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma'; // Sesuaikan path ke prisma client Anda
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Sesuaikan path
import { Role, Prisma } from '@prisma/client'; // Impor enum Role dan Prisma untuk tipe Decimal

const SETTINGS_ID = "global_settings"; // ID tetap untuk record AttendanceSetting

// Handler untuk GET request (mengambil pengaturan absensi)
const getAttendanceSettingsHandler = async (request: AuthenticatedRequest) => {
  if (request.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang diizinkan.' }, { status: 403 });
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
          // Nilai default akan diambil dari skema Prisma jika tidak dispesifikkan di sini.
          // Skema Anda sudah memiliki @default untuk semua field di AttendanceSetting.
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
  if (request.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang diizinkan.' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Ambil semua nilai dari body
    const {
      workStartTimeHour,
      workStartTimeMinute,
      lateToleranceMinutes,
      workEndTimeHour,
      workEndTimeMinute,
      isLocationLockActive,
      targetLatitude: bodyTargetLatitude,     // Beri nama berbeda untuk menghindari kebingungan scope
      targetLongitude: bodyTargetLongitude,   // Beri nama berbeda
      allowedRadiusMeters: bodyAllowedRadiusMeters, // Beri nama berbeda
    } = body;

    // Validasi input dasar
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

    // Variabel untuk menyimpan nilai yang sudah diproses untuk database
    let finalTargetLatitude: Prisma.Decimal | null = null;
    let finalTargetLongitude: Prisma.Decimal | null = null;
    let finalAllowedRadiusMeters: number | null = null;

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
      finalTargetLatitude = new Prisma.Decimal(Number(bodyTargetLatitude).toFixed(6));
      finalTargetLongitude = new Prisma.Decimal(Number(bodyTargetLongitude).toFixed(6));
      finalAllowedRadiusMeters = parseInt(String(bodyAllowedRadiusMeters));
    } else {
      // Jika lock tidak aktif, pastikan nilai-nilai ini null untuk update/create
      finalTargetLatitude = null;
      finalTargetLongitude = null;
      finalAllowedRadiusMeters = null; // Atau Anda bisa membiarkan @default dari skema jika create,
                                       // tapi untuk update, set null agar membersihkan nilai sebelumnya.
                                       // Skema Anda sudah punya @default(300) untuk allowedRadiusMeters,
                                       // jadi saat create, jika ini null, default akan dipakai jika tidak di-override.
                                       // Namun, jika kita ingin 'menonaktifkan' radius, set ke null adalah yang terbaik.
    }
    
    // Data untuk operasi update dan create
    const dataForOperation = {
        workStartTimeHour,
        workStartTimeMinute,
        lateToleranceMinutes,
        workEndTimeHour,
        workEndTimeMinute,
        isLocationLockActive,
        targetLatitude: finalTargetLatitude,       // Tipe: Prisma.Decimal | null
        targetLongitude: finalTargetLongitude,     // Tipe: Prisma.Decimal | null
        allowedRadiusMeters: finalAllowedRadiusMeters, // Tipe: number | null
    };

    const updatedSettings = await prisma.attendanceSetting.upsert({
      where: { id: SETTINGS_ID },
      update: dataForOperation, // Semua field di sini akan di-set nilainya
      create: {
        id: SETTINGS_ID,
        ...dataForOperation,
        // Jika ada field di 'dataForOperation' yang null dan skema memiliki @default,
        // dan field tersebut opsional saat create, @default akan digunakan jika field tidak ada.
        // Namun karena semua field ada di 'dataForOperation' (meskipun nilainya null),
        // nilai null tersebut yang akan digunakan untuk create, meng-override @default jika fieldnya nullable.
        // Untuk field yang non-nullable di create (seperti Int), pastikan ada nilainya.
        // Semua field di AttendanceSetting Anda memiliki @default atau nullable, jadi ini aman.
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
