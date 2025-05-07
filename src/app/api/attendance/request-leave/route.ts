// File: src/app/api/attendance/request-leave/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path ke prisma client benar
// --- Pastikan semua enum ini ada di schema.prisma dan sudah di-generate ---
import { Prisma, AttendanceStatus, LeaveRequestStatus, Role } from '@prisma/client';
// --- Akhir impor enum ---
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Middleware autentikasi Anda
import { writeFile, mkdir } from 'fs/promises'; // Untuk handle file upload
import path from 'path';
import { Buffer } from 'buffer';


async function handleLeaveSubmission(request: AuthenticatedRequest) {
  const userId = request.user?.id;

  if (!userId) {
    return NextResponse.json(
      { success: false, message: 'Akses ditolak: Pengguna tidak terautentikasi.' },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const leaveTypeString = formData.get('leaveType') as string | null;
    const startDateString = formData.get('startDate') as string | null;
    const endDateString = formData.get('endDate') as string | null;
    const reason = formData.get('reason') as string | null;
    const attachmentFile = formData.get('attachment') as File | null;

    // Validasi input dasar
    if (!leaveTypeString || !startDateString || !endDateString || !reason) {
      return NextResponse.json(
        { success: false, message: 'Data tidak lengkap: Tipe, tanggal mulai, tanggal selesai, dan alasan wajib diisi.' },
        { status: 400 }
      );
    }

    // Validasi dan konversi tipe izin dari string ke enum AttendanceStatus
    let leaveTypeEnumValue: AttendanceStatus;
    switch (leaveTypeString.toUpperCase()) { // Cocokkan dengan nama enum di Flutter
      case 'IZIN':
        leaveTypeEnumValue = AttendanceStatus.IZIN;
        break;
      case 'SAKIT':
        leaveTypeEnumValue = AttendanceStatus.SAKIT;
        break;
      case 'CUTI':
        leaveTypeEnumValue = AttendanceStatus.CUTI;
        break;
      default:
        return NextResponse.json({ success: false, message: `Tipe izin '${leaveTypeString}' tidak valid.` }, { status: 400 });
    }

    const startDate = new Date(startDateString);
    const endDate = new Date(endDateString);

    // Validasi tanggal
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ success: false, message: 'Format tanggal tidak valid.' }, { status: 400 });
    }
    if (startDate.getTime() > endDate.getTime()) {
      return NextResponse.json({ success: false, message: 'Tanggal mulai tidak boleh setelah tanggal selesai.' }, { status: 400 });
    }

    let attachmentUrl: string | null = null;
    if (attachmentFile) {
      try {
        const fileBuffer = Buffer.from(await attachmentFile.arrayBuffer());
        const timestamp = Date.now();
        const fileExtension = attachmentFile.name.split('.').pop() || 'bin';
        const uniqueFileName = `leave-${userId}-${timestamp}.${fileExtension}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'leave_attachments');
        const filePath = path.join(uploadDir, uniqueFileName);

        await mkdir(uploadDir, { recursive: true });
        await writeFile(filePath, fileBuffer);
        console.log(`[API Submit Leave] Attachment saved: ${filePath}`);
        attachmentUrl = `/uploads/leave_attachments/${uniqueFileName}`; // Path relatif
      } catch (uploadError) {
        console.error(`[API Submit Leave] User ${userId}: Failed to save attachment file!`, uploadError);
        // Gagal upload attachment tidak menghentikan proses, tapi attachmentUrl akan null
      }
    }

    // Buat record baru di tabel LeaveRequest
    const newLeaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: userId,
        leaveType: leaveTypeEnumValue, // Simpan sebagai enum AttendanceStatus
        startDate: startDate,
        endDate: endDate,
        reason: reason.trim(),
        attachmentUrl: attachmentUrl,
        status: LeaveRequestStatus.PENDING_APPROVAL, // Status awal menunggu persetujuan
        requestedAt: new Date(),
      },
    });

    console.log(`[API Submit Leave] User ${userId} submitted new leave request ID: ${newLeaveRequest.id}`);

    return NextResponse.json(
      { success: true, message: 'Pengajuan izin berhasil dikirim dan menunggu persetujuan.', leaveRequestId: newLeaveRequest.id },
      { status: 201 }
    );

  } catch (error: unknown) {
    console.error('[API Submit Leave] Error:', error);
    let errorMessage = 'Terjadi kesalahan pada server saat memproses pengajuan izin.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // Tangani error spesifik jika perlu, misalnya jika body JSON tidak valid
    if (error instanceof SyntaxError) { // Jika error parsing FormData
        errorMessage = 'Format data permintaan tidak valid.';
        return NextResponse.json({ success: false, message: errorMessage }, { status: 400 });
    }
    // Tangani error Prisma (misalnya, relasi tidak ditemukan)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Contoh: P2003 adalah error foreign key constraint
        if (error.code === 'P2003') {
            errorMessage = 'Data pengguna atau referensi lain tidak valid.';
            return NextResponse.json({ success: false, message: errorMessage, code: error.code }, { status: 400 });
        }
    }

    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 } // 500 Internal Server Error
    );
  }
}

// Bungkus handler dengan middleware autentikasi
// Semua pengguna terautentikasi bisa mengajukan izin
export const POST = withAuth(handleLeaveSubmission);
