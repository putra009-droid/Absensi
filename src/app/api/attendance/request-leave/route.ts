// File: src/app/api/attendance/request-leave/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path ke prisma client benar
import { Prisma, AttendanceStatus, Role } from '@prisma/client'; // Impor enum yang relevan
import { withAuth, AuthenticatedRequest } from '@/lib/authMiddleware'; // Middleware autentikasi Anda
import { writeFile, mkdir } from 'fs/promises'; // Untuk handle file upload
import path from 'path';
import { Buffer } from 'buffer';

// Definisikan tipe data yang diharapkan dari request body (FormData)
interface LeaveRequestBody {
  leaveType: string; // Akan berupa 'IZIN', 'SAKIT', 'CUTI'
  startDate: string; // Format YYYY-MM-DD
  endDate: string;   // Format YYYY-MM-DD
  reason: string;
  attachment?: File; // Opsional
}

// Handler untuk metode POST
async function handleLeaveRequest(request: AuthenticatedRequest) {
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

    // Validasi tipe izin
    let leaveTypeEnumValue: AttendanceStatus;
    switch (leaveTypeString.toUpperCase()) {
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
        const fileExtension = attachmentFile.name.split('.').pop() || 'bin'; // Default extension
        // Buat nama file unik, misalnya berdasarkan userId dan timestamp
        const uniqueFileName = `leave-${userId}-${timestamp}.${fileExtension}`;
        // Tentukan direktori upload (pastikan folder ini ada atau bisa dibuat)
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'leave_attachments');
        const filePath = path.join(uploadDir, uniqueFileName);

        // Buat direktori jika belum ada
        await mkdir(uploadDir, { recursive: true });
        // Tulis file ke server
        await writeFile(filePath, fileBuffer);
        console.log(`[API Leave Request] Attachment file saved to: ${filePath}`);

        // Simpan path relatif untuk diakses via URL
        attachmentUrl = `/uploads/leave_attachments/${uniqueFileName}`;
      } catch (uploadError) {
        console.error(`[API Leave Request] User ${userId}: Failed to save attachment file!`, uploadError);
        // Gagal upload attachment tidak menghentikan proses, tapi attachmentUrl akan null
      }
    }

    // Simpan pengajuan izin ke database (contoh, Anda mungkin perlu tabel terpisah `LeaveRequest`)
    // Untuk contoh ini, kita akan langsung mencoba membuat/mengupdate AttendanceRecord
    // Ini adalah penyederhanaan, idealnya ada tabel LeaveRequest dengan status approval

    const datesToUpdate: Date[] = [];
    let currentDate = new Date(startDate);
    while (currentDate.getTime() <= endDate.getTime()) {
      datesToUpdate.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Proses setiap tanggal dalam rentang izin
    // Ini adalah logika yang sangat disederhanakan.
    // Idealnya, Anda membuat record di tabel 'LeaveRequest' dengan status PENDING,
    // lalu Admin/HR yang akan menyetujui dan mengubah AttendanceRecord.
    // Untuk sekarang, kita asumsikan pengajuan langsung mengubah status.
    const results = [];
    for (const date of datesToUpdate) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      // Cek apakah sudah ada record absensi untuk hari itu
      const existingRecord = await prisma.attendanceRecord.findFirst({
        where: {
          userId: userId,
          clockIn: { // Cek apakah clockIn ada di hari tersebut
            gte: dayStart,
            lt: dayEnd,
          },
        },
      });

      if (existingRecord) {
        // Jika sudah ada record (misal sudah clock-in atau status lain), update statusnya
        // Ini mungkin perlu kebijakan khusus, misal tidak boleh ajukan izin jika sudah clock-in.
        // Untuk contoh: kita update saja.
        const updated = await prisma.attendanceRecord.update({
          where: { id: existingRecord.id },
          data: {
            status: leaveTypeEnumValue,
            notes: `Pengajuan ${leaveTypeString}: ${reason}${attachmentUrl ? ` (Lampiran: ${attachmentUrl})` : ''}`,
            // Kosongkan clockIn/Out jika ini adalah izin/sakit/cuti penuh hari? Tergantung kebijakan.
            // clockOut: null, // Contoh
          },
        });
        results.push({ date: date.toISOString().split('T')[0], status: 'updated', recordId: updated.id });
      } else {
        // Jika belum ada record, buat record baru dengan status izin/sakit/cuti
        // ClockIn di-set ke awal hari, clockOut bisa null
        const created = await prisma.attendanceRecord.create({
          data: {
            userId: userId,
            clockIn: dayStart, // Atau waktu spesifik jika relevan
            status: leaveTypeEnumValue,
            notes: `Pengajuan ${leaveTypeString}: ${reason}${attachmentUrl ? ` (Lampiran: ${attachmentUrl})` : ''}`,
            selfieInUrl: attachmentUrl, // Simpan URL attachment di sini jika relevan
          },
        });
        results.push({ date: date.toISOString().split('T')[0], status: 'created', recordId: created.id });
      }
    }

    console.log(`[API Leave Request] User ${userId} submitted leave request. Results:`, results);

    return NextResponse.json(
      { success: true, message: 'Pengajuan izin berhasil dikirim dan sedang diproses.', data: results },
      { status: 201 } // 201 Created atau 200 OK
    );

  } catch (error: unknown) {
    console.error('[API Leave Request] Error:', error);
    let errorMessage = 'Terjadi kesalahan pada server saat memproses pengajuan izin.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    if (error instanceof SyntaxError) { // Jika error parsing FormData
        errorMessage = 'Format data permintaan tidak valid.';
        return NextResponse.json({ success: false, message: errorMessage }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 500 }
    );
  }
}

// Bungkus handler dengan middleware autentikasi
// Hanya metode POST yang diizinkan untuk endpoint ini
export const POST = withAuth(handleLeaveRequest);
