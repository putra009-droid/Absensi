// File Lokasi: src/app/api/admin/attendance-settings/route.ts

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma'; // Sesuaikan path ke prisma client Anda
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Sesuaikan path
import { Role } from '@prisma/client'; // Impor enum Role

const SETTINGS_ID = "global_settings"; // ID tetap untuk record AttendanceSetting

// Handler untuk GET request (mengambil pengaturan absensi)
const getAttendanceSettingsHandler = async (request: AuthenticatedRequest) => {
  // Pastikan hanya SUPER_ADMIN yang bisa mengakses
  if (request.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang diizinkan.' }, { status: 403 });
  }

  try {
    let settings = await prisma.attendanceSetting.findUnique({
      where: { id: SETTINGS_ID },
    });

    // Jika belum ada settings, buat dengan nilai default
    if (!settings) {
      console.log(`[API AttendanceSettings] Pengaturan tidak ditemukan, membuat record default dengan ID: ${SETTINGS_ID}`);
      settings = await prisma.attendanceSetting.create({
        data: {
          id: SETTINGS_ID,
          // Nilai default akan diambil dari skema Prisma jika tidak dispesifikkan di sini
          // workStartTimeHour: 8, 
          // workStartTimeMinute: 0,
          // lateToleranceMinutes: 15,
          // workEndTimeHour: 17, 
          // workEndTimeMinute: 0,
        },
      });
      console.log(`[API AttendanceSettings] Record default berhasil dibuat.`);
    }

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('[API GET_ATTENDANCE_SETTINGS_ERROR]', error);
    return NextResponse.json({ success: false, message: 'Gagal mengambil pengaturan absensi.' }, { status: 500 });
  }
};

// Handler untuk POST request (memperbarui pengaturan absensi)
const updateAttendanceSettingsHandler = async (request: AuthenticatedRequest) => {
  // Pastikan hanya SUPER_ADMIN yang bisa mengakses
  if (request.user?.role !== Role.SUPER_ADMIN) {
    return NextResponse.json({ success: false, message: 'Akses ditolak: Hanya SUPER_ADMIN yang diizinkan.' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const {
      workStartTimeHour,
      workStartTimeMinute,
      lateToleranceMinutes,
      workEndTimeHour,      // Field ini yang menyebabkan error jika Prisma Client belum update
      workEndTimeMinute,    // Field ini yang menyebabkan error jika Prisma Client belum update
    } = body;

    // Validasi tipe data dan rentang nilai
    if (
      typeof workStartTimeHour !== 'number' || workStartTimeHour < 0 || workStartTimeHour > 23 ||
      typeof workStartTimeMinute !== 'number' || workStartTimeMinute < 0 || workStartTimeMinute > 59 ||
      typeof lateToleranceMinutes !== 'number' || lateToleranceMinutes < 0 ||
      typeof workEndTimeHour !== 'number' || workEndTimeHour < 0 || workEndTimeHour > 23 ||
      typeof workEndTimeMinute !== 'number' || workEndTimeMinute < 0 || workEndTimeMinute > 59
    ) {
      return NextResponse.json({
        success: false,
        message: 'Data tidak valid. Pastikan semua field jam dan menit adalah angka dalam rentang yang benar.',
      }, { status: 400 });
    }

    const updatedSettings = await prisma.attendanceSetting.upsert({
      where: { id: SETTINGS_ID },
      update: { // TypeScript akan memeriksa field di sini berdasarkan Prisma Client
        workStartTimeHour,
        workStartTimeMinute,
        lateToleranceMinutes,
        workEndTimeHour,
        workEndTimeMinute,
      },
      create: { // TypeScript juga akan memeriksa field di sini
        id: SETTINGS_ID,
        workStartTimeHour,
        workStartTimeMinute,
        lateToleranceMinutes,
        workEndTimeHour,
        workEndTimeMinute,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Pengaturan absensi berhasil diperbarui!',
      data: updatedSettings,
    });
  } catch (error: any) {
    console.error('[API UPDATE_ATTENDANCE_SETTINGS_ERROR]', error);
    if (error.name === 'PrismaClientValidationError' || error.code === 'P2009' || error.code === 'P2025') { // P2009: Failed to validate the query
        return NextResponse.json({ success: false, message: 'Data input tidak valid untuk pembaruan atau field tidak dikenal.' }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: 'Gagal memperbarui pengaturan absensi.' }, { status: 500 });
  }
};

export const GET = withAuth(getAttendanceSettingsHandler as any);
export const POST = withAuth(updateAttendanceSettingsHandler as any);
