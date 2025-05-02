// src/lib/attendanceLogic.ts
// Versi lengkap dengan perbaikan await getBatasTerlambat

import { AttendanceRecord, PrismaClient, Role, Prisma, AttendanceStatus } from '@prisma/client'; // Pastikan AttendanceStatus diimpor
// Import helper dari config (pastikan path benar)
import { getBatasTerlambat, isHariKerja } from './config';
import { prisma } from './prisma'; // Import instance prisma

// Tipe data custom untuk status harian (termasuk BELUM dan LIBUR)
export type StatusAbsensiHarian = AttendanceStatus | 'BELUM' | 'LIBUR';

// Interface untuk struktur detail absensi per hari
export interface DetailAbsensiHarian {
    tanggal: Date;
    status: StatusAbsensiHarian;
    clockIn?: Date | null;
    clockOut?: Date | null;
    latitudeIn?: Prisma.Decimal | null;
    longitudeIn?: Prisma.Decimal | null;
    latitudeOut?: Prisma.Decimal | null;
    longitudeOut?: Prisma.Decimal | null;
    notes?: string | null; // Tambahkan notes jika perlu ditampilkan
}

// Interface untuk struktur hasil rekap bulanan
export interface RekapBulan {
    totalHadir: number;
    totalTerlambat: number;
    totalAlpha: number;
    totalIzin?: number; // Opsional: Counter terpisah
    totalSakit?: number; // Opsional: Counter terpisah
    totalCuti?: number; // Opsional: Counter terpisah
    totalHariKerja: number; // Hari kerja efektif dalam periode rekap sejauh ini
    detailPerHari: DetailAbsensiHarian[];
}

// --- Fungsi getStatusHarian (Dengan Perbaikan Await) ---
// Fungsi ini sekarang ASYNC karena memanggil getBatasTerlambat yang async
export async function getStatusHarian(
    userId: string,
    tanggal: Date
): Promise<DetailAbsensiHarian> { // Return type menjadi Promise
    // Validasi input dasar
     if (!userId || !tanggal || isNaN(tanggal.getTime())) {
         console.error("[getStatusHarian] Invalid parameters received:", { userId, tanggal });
         const currentDay = new Date(); currentDay.setHours(0,0,0,0);
         // Gunakan AttendanceStatus.ALPHA atau 'LIBUR'
         const defaultStatus = isHariKerja(currentDay) ? AttendanceStatus.ALPHA : 'LIBUR';
         return { tanggal: currentDay, status: defaultStatus, clockIn: null, clockOut: null, notes: null };
     }

    const awalHari = new Date(tanggal); awalHari.setHours(0, 0, 0, 0);
    const akhirHari = new Date(tanggal); akhirHari.setHours(23, 59, 59, 999);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Inisialisasi objek detail
    const detail: DetailAbsensiHarian = {
        tanggal: new Date(tanggal),
        // Tentukan status awal berdasarkan hari kerja dan apakah tanggal sudah lewat
        status: isHariKerja(tanggal) ? (tanggal > today ? 'BELUM' : AttendanceStatus.ALPHA) : 'LIBUR',
        clockIn: null, clockOut: null,
        latitudeIn: null, longitudeIn: null, latitudeOut: null, longitudeOut: null,
        notes: null, // Inisialisasi notes
    };

    // Hanya query jika tanggal valid dan tidak di masa depan
    if (tanggal <= today) {
        try {
            // Ambil record absensi terbaru untuk hari itu
            const record = await prisma.attendanceRecord.findFirst({
                where: { userId: userId, clockIn: { gte: awalHari, lte: akhirHari } },
                orderBy: { clockIn: 'asc' }, // Ambil yang paling awal jika ada > 1 (seharusnya tidak)
                select: { clockIn: true, clockOut: true, status: true, notes: true, latitudeIn: true, longitudeIn: true, latitudeOut: true, longitudeOut: true }
            });

            if (record) { // Record ditemukan
                detail.clockIn = record.clockIn;
                detail.clockOut = record.clockOut;
                detail.latitudeIn = record.latitudeIn;
                detail.longitudeIn = record.longitudeIn;
                detail.latitudeOut = record.latitudeOut;
                detail.longitudeOut = record.longitudeOut;
                detail.notes = record.notes; // Ambil notes

                // Tentukan status berdasarkan data DB
                // Prioritaskan status eksplisit dari DB (Izin, Sakit, Cuti, Selesai, Alpha dari admin)
                if (record.status === AttendanceStatus.IZIN ||
                    record.status === AttendanceStatus.SAKIT ||
                    record.status === AttendanceStatus.CUTI ||
                    record.status === AttendanceStatus.SELESAI ||
                    record.status === AttendanceStatus.ALPHA) // Jika admin set ALPHA manual
                {
                    detail.status = record.status;
                } else if (record.clockOut) { // Jika ada clock out tapi status bukan Selesai/Izin/dll, anggap Selesai
                    detail.status = AttendanceStatus.SELESAI;
                } else if (record.clockIn) { // Jika ada clockIn tapi belum clockOut
                    // Gunakan status dari DB jika HADIR/TERLAMBAT (sudah ditentukan saat clock-in)
                    if(record.status === AttendanceStatus.HADIR || record.status === AttendanceStatus.TERLAMBAT) {
                        detail.status = record.status;
                    } else {
                        // Jika statusnya aneh (misal masih BELUM padahal ada clockIn), hitung ulang
                        console.warn(`[getStatusHarian] Recalculating status for record with clockIn but status is ${record.status}`);
                        // ====> PERBAIKAN: Tambahkan await di sini <====
                        const batasTerlambat = await getBatasTerlambat(tanggal); // Tunggu hasil Promise<Date>
                        // Sekarang batasTerlambat adalah Date
                        detail.status = record.clockIn > batasTerlambat ? AttendanceStatus.TERLAMBAT : AttendanceStatus.HADIR;
                        // ====> AKHIR PERBAIKAN <====
                    }
                } else if (isHariKerja(tanggal)){ // Jika record ada, tapi clockIn/Out null di hari kerja -> ALPHA
                    detail.status = AttendanceStatus.ALPHA;
                } else { // Jika record ada tapi bukan hari kerja -> LIBUR
                    detail.status = 'LIBUR';
                }

            } else { // Tidak ada record sama sekali untuk hari ini
                if (isHariKerja(tanggal)) { detail.status = AttendanceStatus.ALPHA; }
                else { detail.status = 'LIBUR'; }
            }
        } catch (dbError) {
            console.error(`[getStatusHarian] Prisma findFirst error for ${userId} on ${tanggal.toISOString().split('T')[0]}:`, dbError);
            // Jika error DB, anggap ALPHA jika hari kerja, LIBUR jika bukan
             detail.status = isHariKerja(tanggal) ? AttendanceStatus.ALPHA : 'LIBUR';
            detail.clockIn = null; detail.clockOut = null; detail.notes = "Error loading data";
        }
    } else { // Hari di masa depan
         detail.status = isHariKerja(tanggal) ? 'BELUM' : 'LIBUR';
    }

    // console.log("[getStatusHarian] Returning detail:", JSON.stringify(detail, null, 2));
    return detail;
}
// --- AKHIR getStatusHarian ---


// --- Fungsi getRekapBulanan (Dengan Perbaikan Logika Total & Logging) ---
// Fungsi ini sekarang harus ASYNC karena memanggil getStatusHarian yang async
export async function getRekapBulanan(
    userId: string,
    tahun: number,
    bulan: number // Asumsi 0-11 (Januari=0, dst.)
): Promise<RekapBulan> { // Return type menjadi Promise

    // Validasi Input
    if (!userId || typeof userId !== 'string' || isNaN(tahun) || isNaN(bulan) || bulan < 0 || bulan > 11) {
        console.error("[getRekapBulanan] Invalid parameters:", { userId, tahun, bulan });
        throw new Error('Parameter tidak valid untuk getRekapBulanan');
    }

    // Inisialisasi objek rekap
    const rekap: RekapBulan = {
        totalHadir: 0, totalTerlambat: 0, totalAlpha: 0,
        totalIzin: 0, totalSakit: 0, totalCuti: 0, // Inisialisasi counter opsional
        totalHariKerja: 0, detailPerHari: []
    };

    // Tentukan rentang tanggal (UTC agar konsisten)
    const tanggalAwalBulan = new Date(Date.UTC(tahun, bulan, 1, 0, 0, 0, 0));
    const tanggalAkhirBulan = new Date(Date.UTC(tahun, bulan + 1, 0, 23, 59, 59, 999));
    const today = new Date(); // Waktu lokal server untuk perbandingan
    today.setHours(0, 0, 0, 0);

    console.log(`[getRekapBulanan] Generating recap for User: ${userId}, Period: ${tanggalAwalBulan.toISOString()} - ${tanggalAkhirBulan.toISOString()}`);

    try {
        // 1. Ambil semua record absensi dalam rentang bulan (lebih efisien ambil semua dulu)
        const recordsBulanIni = await prisma.attendanceRecord.findMany({
            where: {
                userId: userId,
                // Ambil record yang clockIn-nya dalam rentang bulan ini
                // Atau bisa juga filter berdasarkan createdAt jika lebih relevan
                clockIn: { gte: tanggalAwalBulan, lte: tanggalAkhirBulan }
            },
            orderBy: { clockIn: 'asc' },
            select: { id: true, clockIn: true, clockOut: true, userId: true, status: true, notes: true, latitudeIn: true, longitudeIn: true, latitudeOut: true, longitudeOut: true }
        });
        console.log(`[getRekapBulanan] Found ${recordsBulanIni.length} records in DB for the period.`);

        // 2. Buat Map untuk akses cepat berdasarkan tanggal (kunci YYYY-MM-DD dari waktu lokal server)
        const recordsMap = new Map<string, typeof recordsBulanIni[0]>();
        recordsBulanIni.forEach(record => {
            // Gunakan clockIn untuk menentukan tanggal record
            const recordDate = new Date(record.clockIn);
            // Buat kunci berdasarkan tanggal LOKAL server (untuk dicocokkan dengan iterator)
            const dateKey = `${recordDate.getFullYear()}-${(recordDate.getMonth() + 1).toString().padStart(2, '0')}-${recordDate.getDate().toString().padStart(2, '0')}`;
            // Hanya simpan record pertama jika ada duplikat di hari yang sama (seharusnya tidak terjadi jika logic benar)
            if (!recordsMap.has(dateKey)) {
                 recordsMap.set(dateKey, record);
            }
        });

        // 3. Iterasi setiap hari dalam bulan
        const iteratorTanggal = new Date(tanggalAwalBulan); // Mulai dari awal bulan (UTC)
        while (iteratorTanggal <= tanggalAkhirBulan && iteratorTanggal.getUTCMonth() === bulan) {
            // Buat objek Date baru untuk tanggal lokal yang akan dicek
            // Ini penting agar tidak memodifikasi iteratorTanggal (UTC)
            const tanggalCek = new Date(iteratorTanggal.getUTCFullYear(), iteratorTanggal.getUTCMonth(), iteratorTanggal.getUTCDate());
            tanggalCek.setHours(0,0,0,0); // Set ke awal hari (lokal)

            // === Panggil getStatusHarian yang sudah async ===
            // Cari record di map untuk tanggal ini
            const dateKey = `${tanggalCek.getFullYear()}-${(tanggalCek.getMonth() + 1).toString().padStart(2, '0')}-${tanggalCek.getDate().toString().padStart(2, '0')}`;
            const recordHariIni = recordsMap.get(dateKey);

            // Dapatkan detail status harian (sudah menghandle LIBUR, BELUM, ALPHA, dll.)
            // Kita perlu await karena getStatusHarian sekarang async
            const detailHariIni = await getStatusHarian(userId, tanggalCek);
            rekap.detailPerHari.push(detailHariIni); // Masukkan detail ke hasil

            // === Hitung Total Berdasarkan Status Final dari detailHariIni ===
            const isWorkingDay = isHariKerja(tanggalCek);
            if (isWorkingDay && tanggalCek <= today) { // Hanya hitung hari kerja yang sudah lewat
                rekap.totalHariKerja++; // Tambah hari kerja efektif
                switch (detailHariIni.status) {
                    case AttendanceStatus.HADIR:
                    case AttendanceStatus.SELESAI: // Anggap Selesai = Hadir
                        rekap.totalHadir++;
                        break;
                    case AttendanceStatus.TERLAMBAT:
                        rekap.totalTerlambat++;
                        break;
                    case AttendanceStatus.ALPHA:
                        rekap.totalAlpha++;
                        break;
                    case AttendanceStatus.IZIN:
                        if (rekap.totalIzin !== undefined) rekap.totalIzin++;
                        break;
                    case AttendanceStatus.SAKIT:
                        if (rekap.totalSakit !== undefined) rekap.totalSakit++;
                        break;
                    case AttendanceStatus.CUTI:
                        if (rekap.totalCuti !== undefined) rekap.totalCuti++;
                        break;
                    // Status 'BELUM' dan 'LIBUR' tidak perlu dihitung di total utama
                }
            }

            // Lanjut ke hari berikutnya (iterator menggunakan UTC)
            iteratorTanggal.setUTCDate(iteratorTanggal.getUTCDate() + 1);
        } // Akhir loop while

        console.log(`[getRekapBulanan] Finished processing for User: ${userId}. Totals: Hadir=${rekap.totalHadir}, Terlambat=${rekap.totalTerlambat}, Alpha=${rekap.totalAlpha}, HariKerja=${rekap.totalHariKerja}`);
        return rekap; // Kembalikan hasil rekap

    } catch (error) {
        console.error(`[getRekapBulanan Error] User: ${userId}, Year: ${tahun}, Month: ${bulan}:`, error);
        throw new Error('Gagal menghasilkan rekap bulanan.');
    }
}
// --- AKHIR getRekapBulanan ---
