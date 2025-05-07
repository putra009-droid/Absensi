// File: src/app/api/yayasan/leave-requests/[leaveRequestId]/approve/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, LeaveRequestStatus, AttendanceStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Handler untuk PUT (menyetujui pengajuan izin)
async function approveLeaveRequestHandler(
  request: AuthenticatedRequest,
  { params }: { params: { leaveRequestId: string } }
) {
  const yayasanUserId = request.user?.id;
  // Pastikan hanya Yayasan yang bisa akses
  if (request.user?.role !== Role.YAYASAN || !yayasanUserId) {
    return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
  }

  const { leaveRequestId } = params;
  if (!leaveRequestId) {
    return NextResponse.json({ message: 'ID Pengajuan Izin diperlukan.' }, { status: 400 });
  }

  try {
    // Gunakan transaksi Prisma untuk memastikan konsistensi data
    const updatedLeaveRequest = await prisma.$transaction(async (tx) => {
      // 1. Ambil data pengajuan izin
      const leaveRequest = await tx.leaveRequest.findUnique({
        where: { id: leaveRequestId },
      });

      if (!leaveRequest) {
        throw new Error('Pengajuan izin tidak ditemukan.'); // Akan di-catch dan return 404
      }
      if (leaveRequest.status !== LeaveRequestStatus.PENDING_APPROVAL) {
        throw new Error(`Pengajuan izin ini sudah ${leaveRequest.status.toLowerCase()}.`); // Akan di-catch dan return 400
      }

      // 2. Update status pengajuan izin menjadi APPROVED
      const approvedRequest = await tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: LeaveRequestStatus.APPROVED,
          processedById: yayasanUserId,
          processedAt: new Date(),
        },
        include: { user: { select: { id: true, name: true, email: true } } }, // Sertakan info user untuk respons
      });

      // 3. Buat/Update AttendanceRecord untuk setiap hari dalam rentang izin
      const datesToUpdate: Date[] = [];
      let currentDate = new Date(approvedRequest.startDate);
      while (currentDate.getTime() <= approvedRequest.endDate.getTime()) {
        datesToUpdate.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      for (const date of datesToUpdate) {
        const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

        const existingAttendance = await tx.attendanceRecord.findFirst({
          where: { userId: approvedRequest.userId, clockIn: { gte: dayStart, lt: dayEnd } },
        });

        if (existingAttendance) {
          // Jika sudah ada record, update statusnya
          await tx.attendanceRecord.update({
            where: { id: existingAttendance.id },
            data: {
              status: approvedRequest.leaveType, // IZIN, SAKIT, atau CUTI
              notes: `Disetujui: ${approvedRequest.reason}`,
              // Pertimbangkan apakah clockIn/Out perlu di-null-kan
            },
          });
        } else {
          // Jika belum ada, buat record baru
          await tx.attendanceRecord.create({
            data: {
              userId: approvedRequest.userId,
              clockIn: dayStart, // Atau waktu relevan lainnya
              status: approvedRequest.leaveType,
              notes: `Disetujui: ${approvedRequest.reason}`,
              selfieInUrl: approvedRequest.attachmentUrl, // Simpan attachment jika ada
            },
          });
        }
      }
      return approvedRequest;
    });

    return NextResponse.json(
      { message: 'Pengajuan izin berhasil disetujui.', leaveRequest: updatedLeaveRequest },
      { status: 200 }
    );

  } catch (error: unknown) {
    console.error('[API Yayasan Approve Leave] Error:', error);
    let errorMessage = 'Gagal menyetujui pengajuan izin.';
    let statusCode = 500;
    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes('tidak ditemukan')) statusCode = 404;
      if (error.message.includes('sudah')) statusCode = 400;
    }
    return NextResponse.json({ message: errorMessage }, { status: statusCode });
  }
}

export const PUT = withAuth(approveLeaveRequestHandler); // Gunakan PUT untuk update status
