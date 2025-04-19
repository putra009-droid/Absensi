// Lokasi File: src/lib/attendanceLogic.ts

import { AttendanceRecord, PrismaClient, Role, Prisma, AttendanceStatus } from '@prisma/client'; // Pastikan AttendanceStatus diimpor
import { getBatasTerlambat, isHariKerja } from './config';
import { prisma } from './prisma';

// Gunakan tipe dari Prisma atau definisikan sendiri jika perlu penyesuaian
export type StatusAbsensiHarian = AttendanceStatus | 'BELUM' | 'LIBUR';
// Interface untuk detail harian (tambahkan properti yang diperlukan)
export interface DetailAbsensiHarian {
  tanggal: Date;
  status: StatusAbsensiHarian;
  clockIn?: Date | null;
  clockOut?: Date | null;
  latitudeIn?: Prisma.Decimal | null;
  longitudeIn?: Prisma.Decimal | null;
  latitudeOut?: Prisma.Decimal | null;
  longitudeOut?: Prisma.Decimal | null;
  // catatan?: string | null; // Jika ada
}

// Interface untuk rekap bulanan
export interface RekapBulan {
  totalHadir: number;
  totalTerlambat: number;
  totalAlpha: number;
  totalHariKerja: number;
  detailPerHari: DetailAbsensiHarian[];
}

// --- IMPLEMENTASI getStatusHarian YANG DIPERBAIKI ---
export async function getStatusHarian(
  userId: string,
  tanggal: Date
): Promise<DetailAbsensiHarian> {
    // Validasi input dasar
     if (!userId || !tanggal || isNaN(tanggal.getTime())) {
        console.error("[getStatusHarian] Invalid parameters received:", { userId, tanggal });
        // Kembalikan status default atau lempar error spesifik
        // Untuk konsistensi, kita kembalikan objek default dengan status ALPHA/LIBUR
        const defaultStatus = isHariKerja(new Date()) ? 'ALPHA' : 'LIBUR'; // Gunakan tanggal valid atau today?
        return { tanggal: new Date(), status: defaultStatus, clockIn: null, clockOut: null }; // Kembalikan objek valid
        // Atau throw new Error('Parameter tidak valid untuk getStatusHarian');
     }


    const awalHari = new Date(tanggal); awalHari.setHours(0, 0, 0, 0);
    const akhirHari = new Date(tanggal); akhirHari.setHours(23, 59, 59, 999);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Inisialisasi objek detail
    const detail: DetailAbsensiHarian = {
        tanggal: new Date(tanggal),
        status: isHariKerja(tanggal) ? (tanggal > today ? 'BELUM' : 'ALPHA') : 'LIBUR',
        clockIn: null, clockOut: null,
        latitudeIn: null, longitudeIn: null, latitudeOut: null, longitudeOut: null,
    };

    // Hanya query jika hari kerja dan tidak di masa depan
    if (isHariKerja(tanggal) && tanggal <= today) {
        try {
            console.log(`[getStatusHarian - Fixed] Querying DB for ${userId} on ${tanggal.toISOString().split('T')[0]}`);
            const record = await prisma.attendanceRecord.findFirst({
                where: { userId: userId, clockIn: { gte: awalHari, lte: akhirHari } },
                orderBy: { clockIn: 'asc' },
                // Select semua field yang relevan
                select: {
                    clockIn: true,
                    clockOut: true, // <-- PENTING
                    status: true,   // <-- PENTING
                    latitudeIn: true, longitudeIn: true,
                    latitudeOut: true, longitudeOut: true
                }
            });
            console.log(`[getStatusHarian - Fixed] DB Record found:`, record);

            if (record) { // Record ditemukan
                detail.clockIn = record.clockIn;
                detail.clockOut = record.clockOut;
                detail.latitudeIn = record.latitudeIn;
                detail.longitudeIn = record.longitudeIn;
                detail.latitudeOut = record.latitudeOut;
                detail.longitudeOut = record.longitudeOut;

                // --- LOGIKA PENENTUAN STATUS YANG BENAR ---
                if (record.clockOut) {
                    // Jika SUDAH ada clockOut, statusnya pasti SELESAI
                    // Gunakan status dari DB jika ada dan valid, jika tidak fallback ke SELESAI
                    detail.status = record.status === AttendanceStatus.SELESAI ? AttendanceStatus.SELESAI : 'SELESAI';
                } else if (record.clockIn) {
                    // Jika ada clockIn tapi belum clockOut, gunakan status dari DB jika HADIR/TERLAMBAT
                    // atau tentukan ulang berdasarkan batas terlambat
                    if (record.status === AttendanceStatus.HADIR || record.status === AttendanceStatus.TERLAMBAT) {
                        detail.status = record.status; // Gunakan status dari DB
                    } else {
                        // Jika status di DB aneh (misal masih default tapi clockIn ada), hitung ulang
                        const batasTerlambat = getBatasTerlambat(tanggal);
                        detail.status = record.clockIn > batasTerlambat ? 'TERLAMBAT' : 'HADIR';
                    }
                } else {
                    // Jika record ada tapi clockIn null (kasus aneh, harusnya ALPHA)
                    detail.status = 'ALPHA';
                }
                // --- AKHIR LOGIKA STATUS ---

            } else {
                 // Jika TIDAK ADA record ditemukan, status tetap ALPHA (default)
                 detail.status = 'ALPHA';
            }
        } catch (dbError) {
            console.error(`[getStatusHarian - Fixed] Prisma findFirst error for ${userId} on ${tanggal.toISOString().split('T')[0]}:`, dbError);
            // Biarkan status default (ALPHA atau LIBUR) jika terjadi error DB
            detail.clockIn = null; detail.clockOut = null; // Pastikan null jika error
        }
    }

    console.log("[getStatusHarian - Fixed] Returning detail:", JSON.stringify(detail, null, 2));
    return detail; // Selalu kembalikan objek detail
}
// --- AKHIR IMPLEMENTASI YANG DIPERBAIKI ---


// Fungsi getRekapBulanan (Biarkan implementasi Anda yang sudah benar sebelumnya)
export async function getRekapBulanan(
  userId: string,
  tahun: number,
  bulan: number
): Promise<RekapBulan> {
    // ... (Implementasi getRekapBulanan Anda yang sudah benar,
    //      termasuk validasi input, query findMany dengan select lokasi,
    //      loop per hari, penentuan status harian dengan cek clockOut,
    //      akumulasi total, dan return rekap) ...

    // Contoh kerangka (GANTI DENGAN KODE LENGKAP ANDA YANG SUDAH BENAR):
      if (!userId || isNaN(tahun) || isNaN(bulan) || bulan < 0 || bulan > 11) { throw new Error('Parameter tidak valid'); }
      const rekap: RekapBulan = { totalHadir: 0, totalTerlambat: 0, totalAlpha: 0, totalHariKerja: 0, detailPerHari: [] };
      const tanggalAwalBulan = new Date(tahun, bulan, 1, 0, 0, 0, 0);
      const tanggalAkhirBulan = new Date(tahun, bulan + 1, 0, 23, 59, 59, 999);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      try {
        const recordsBulanIni = await prisma.attendanceRecord.findMany({
          where: { userId, clockIn: { gte: tanggalAwalBulan, lte: tanggalAkhirBulan } },
          orderBy: { clockIn: 'asc' },
          select: { id: true, clockIn: true, clockOut: true, userId: true, status: true, latitudeIn: true, longitudeIn: true, latitudeOut: true, longitudeOut: true } // Ambil status juga
        });
        const recordsMap = new Map<string, typeof recordsBulanIni[0]>();
        recordsBulanIni.forEach(record => { recordsMap.set(record.clockIn.toISOString().split('T')[0], record); });

        const iteratorTanggal = new Date(tanggalAwalBulan);
        while (iteratorTanggal <= tanggalAkhirBulan && iteratorTanggal.getMonth() === bulan) {
            const tanggalCek = new Date(iteratorTanggal);
            const dateKey = tanggalCek.toISOString().split('T')[0];
            const isWorkingDay = isHariKerja(tanggalCek);
            let statusHariIni: StatusAbsensiHarian = isWorkingDay ? (tanggalCek > today ? 'BELUM' : 'ALPHA') : 'LIBUR';
            let clockInHariIni: Date | null = null;
            let clockOutHariIni: Date | null = null;
            let latIn: Prisma.Decimal | null = null, lonIn: Prisma.Decimal | null = null, latOut: Prisma.Decimal | null = null, lonOut: Prisma.Decimal | null = null;

            if (isWorkingDay && tanggalCek <= today) {
                rekap.totalHariKerja++;
                const recordHariIni = recordsMap.get(dateKey);
                if (recordHariIni) {
                    clockInHariIni = recordHariIni.clockIn;
                    clockOutHariIni = recordHariIni.clockOut;
                    latIn = recordHariIni.latitudeIn; lonIn = recordHariIni.longitudeIn;
                    latOut = recordHariIni.latitudeOut; lonOut = recordHariIni.longitudeOut;

                    // Gunakan status dari DB (yang seharusnya sudah benar)
                    statusHariIni = recordHariIni.status as StatusAbsensiHarian; // Asumsikan status di DB valid

                    // Hitung total berdasarkan status dari DB
                    if (statusHariIni === 'HADIR') { rekap.totalHadir++; }
                    else if (statusHariIni === 'TERLAMBAT') { rekap.totalTerlambat++; }
                    else if (statusHariIni === 'ALPHA') { rekap.totalAlpha++; }
                    // Status lain (SELESAI, IZIN, SAKIT, CUTI) mungkin perlu dihitung terpisah jika ingin ditampilkan di ringkasan

                } else { // Tidak ada record
                    statusHariIni = 'ALPHA'; rekap.totalAlpha++;
                }
            }

            rekap.detailPerHari.push({
              tanggal: new Date(tanggalCek), status: statusHariIni,
              clockIn: clockInHariIni, clockOut: clockOutHariIni,
              latitudeIn: latIn, longitudeIn: lonIn,
              latitudeOut: latOut, longitudeOut: lonOut
            });
            iteratorTanggal.setDate(iteratorTanggal.getDate() + 1);
        }
        return rekap;
      } catch (error) { console.error('Error in getRekapBulanan:', error); throw error; }
}