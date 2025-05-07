// File: src/app/api/yayasan/leave-requests/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Role, LeaveRequestStatus } from '@prisma/client';
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware';

// Handler untuk GET (mengambil daftar pengajuan izin pending)
async function getPendingLeaveRequestsHandler(request: AuthenticatedRequest) {
  // Pastikan hanya Yayasan yang bisa akses
  if (request.user?.role !== Role.YAYASAN) {
    return NextResponse.json({ message: 'Akses ditolak.' }, { status: 403 });
  }

  try {
    const pendingRequests = await prisma.leaveRequest.findMany({
      where: {
        status: LeaveRequestStatus.PENDING_APPROVAL,
      },
      include: {
        user: { // Sertakan info pengguna yang mengajukan
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        requestedAt: 'asc', // Tampilkan yang paling lama dulu
      },
    });

    return NextResponse.json(pendingRequests, { status: 200 });
  } catch (error) {
    console.error('[API Yayasan Get Pending Leaves] Error:', error);
    return NextResponse.json({ message: 'Gagal mengambil daftar pengajuan izin.' }, { status: 500 });
  }
}

export const GET = withAuth(getPendingLeaveRequestsHandler);
