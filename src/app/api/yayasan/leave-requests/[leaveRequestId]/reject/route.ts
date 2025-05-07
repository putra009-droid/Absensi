// File: src/app/api/yayasan/leave-requests/[leaveRequestId]/reject/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path ke prisma client benar
import { Role, LeaveRequestStatus, Prisma } from '@prisma/client'; // Impor enum dari Prisma
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Middleware autentikasi Anda

// Handler untuk metode PUT (menolak pengajuan izin)
async function rejectLeaveRequestHandler(
  request: AuthenticatedRequest,
  { params }: { params: { leaveRequestId: string } } // Ambil leaveRequestId dari parameter path
) {
  const yayasanUserId = request.user?.id; // ID pengguna Yayasan yang melakukan aksi

  // 1. Verifikasi Peran Pengguna
  // Pastikan hanya pengguna dengan peran YAYASAN yang bisa mengakses endpoint ini
  if (request.user?.role !== Role.YAYASAN || !yayasanUserId) {
    return NextResponse.json(
      { success: false, message: 'Akses ditolak: Hanya Yayasan yang dapat menolak pengajuan.' },
      { status: 403 } // 403 Forbidden
    );
  }

  // 2. Ambil leaveRequestId dari parameter path
  const { leaveRequestId } = params;
  if (!leaveRequestId) {
    return NextResponse.json(
      { success: false, message: 'ID Pengajuan Izin diperlukan di URL.' },
      { status: 400 } // 400 Bad Request
    );
  }

  try {
    // 3. Ambil rejectionReason dari body request
    const body = await request.json();
    const { rejectionReason } = body;

    // 4. Validasi rejectionReason
    // --- PERBAIKAN DI SINI ---
    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length === 0) {
    // --- AKHIR PERBAIKAN ---
      return NextResponse.json(
        { success: false, message: 'Alasan penolakan wajib diisi dan tidak boleh kosong.' },
        { status: 400 }
      );
    }

    // 5. Cek apakah pengajuan izin ada dan statusnya PENDING_APPROVAL
    const leaveRequestToReject = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
    });

    if (!leaveRequestToReject) {
      return NextResponse.json(
        { success: false, message: `Pengajuan izin dengan ID ${leaveRequestId} tidak ditemukan.` },
        { status: 404 } // 404 Not Found
      );
    }

    if (leaveRequestToReject.status !== LeaveRequestStatus.PENDING_APPROVAL) {
      return NextResponse.json(
        { success: false, message: `Pengajuan izin ini sudah dalam status '${leaveRequestToReject.status}' dan tidak bisa ditolak lagi.` },
        { status: 400 } // 400 Bad Request (atau 409 Conflict)
      );
    }

    // 6. Update status pengajuan izin menjadi REJECTED di database
    const rejectedRequest = await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: LeaveRequestStatus.REJECTED,
        processedById: yayasanUserId, // Catat siapa yang memproses
        processedAt: new Date(),     // Catat waktu proses
        rejectionReason: rejectionReason.trim(), // Simpan alasan penolakan
      },
      include: { // Sertakan info user untuk respons jika perlu
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    console.log(`[API Yayasan Reject Leave] Leave request ${leaveRequestId} rejected by Yayasan user ${yayasanUserId}. Reason: ${rejectionReason}`);

    // 7. Kirim respons sukses
    return NextResponse.json(
      { success: true, message: 'Pengajuan izin berhasil ditolak.', leaveRequest: rejectedRequest },
      { status: 200 } // 200 OK
    );

  } catch (error: unknown) {
    console.error('[API Yayasan Reject Leave] Error:', error);
    let errorMessage = 'Terjadi kesalahan pada server saat menolak pengajuan izin.';
    let statusCode = 500;

    if (error instanceof SyntaxError) { // Jika error parsing JSON body
        errorMessage = 'Format data permintaan tidak valid.';
        statusCode = 400;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Tangani error spesifik Prisma jika perlu
        errorMessage = 'Terjadi kesalahan database.';
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: statusCode }
    );
  }
}

// Export handler yang sudah dibungkus middleware autentikasi
// Hanya metode PUT yang diizinkan untuk endpoint ini (sesuai desain RESTful untuk update)
export const PUT = withAuth(rejectLeaveRequestHandler);
