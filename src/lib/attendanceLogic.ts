// src/lib/attendanceLogic.ts

import { AttendanceRecord, PrismaClient, Role, Prisma, AttendanceStatus } from '@prisma/client'; // Pastikan AttendanceStatus diimpor
import { getBatasTerlambat, isHariKerja } from './config'; // Import helper dari config
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

// --- Fungsi getStatusHarian (Tidak berubah dari kode Anda sebelumnya) ---
export async function getStatusHarian(
  userId: string,
  tanggal: Date
): Promise<DetailAbsensiHarian> {
    // Validasi input dasar
     if (!userId || !tanggal || isNaN(tanggal.getTime())) {
        console.error("[getStatusHarian] Invalid parameters received:", { userId, tanggal });
        const currentDay = new Date(); currentDay.setHours(0,0,0,0);
        const defaultStatus = isHariKerja(currentDay) ? AttendanceStatus.ALPHA : 'LIBUR'; // Gunakan Enum
        return { tanggal: currentDay, status: defaultStatus, clockIn: null, clockOut: null, notes: null }; // Return notes null
     }

    const awalHari = new Date(tanggal); awalHari.setHours(0, 0, 0, 0);
    const akhirHari = new Date(tanggal); akhirHari.setHours(23, 59, 59, 999);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Inisialisasi objek detail
    const detail: DetailAbsensiHarian = {
        tanggal: new Date(tanggal),
        status: isHariKerja(tanggal) ? (tanggal > today ? 'BELUM' : AttendanceStatus.ALPHA) : 'LIBUR',
        clockIn: null, clockOut: null,
        latitudeIn: null, longitudeIn: null, latitudeOut: null, longitudeOut: null,
        notes: null, // Inisialisasi notes
    };

    // Hanya query jika tanggal valid dan tidak di masa depan
    if (tanggal <= today) {
        try {
            const record = await prisma.attendanceRecord.findFirst({
                where: { userId: userId, clockIn: { gte: awalHari, lte: akhirHari } },
                orderBy: { clockIn: 'asc' },
                // Pilih semua field yang relevan
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
                 // Prioritaskan status eksplisit dari DB (Izin, Sakit, Cuti, Selesai)
                 if (record.status === AttendanceStatus.IZIN || record.status === AttendanceStatus.SAKIT || record.status === AttendanceStatus.CUTI || record.status === AttendanceStatus.SELESAI) {
                    detail.status = record.status;
                 } else if (record.clockOut) { // Jika ada clock out tapi status bukan Selesai (aneh), anggap Selesai
                      detail.status = AttendanceStatus.SELESAI;
                 } else if (record.clockIn) { // Jika ada clockIn tapi belum clockOut
                     // Gunakan status dari DB jika HADIR/TERLAMBAT, jika tidak, hitung ulang
                     if(record.status === AttendanceStatus.HADIR || record.status === AttendanceStatus.TERLAMBAT) {
                        detail.status = record.status;
                     } else {
                         const batasTerlambat = getBatasTerlambat(tanggal);
                         detail.status = record.clockIn > batasTerlambat ? AttendanceStatus.TERLAMBAT : AttendanceStatus.HADIR;
                     }
                 } else if (isHariKerja(tanggal)){ // Jika record ada, tapi clockIn/Out null di hari kerja -> ALPHA
                     detail.status = AttendanceStatus.ALPHA;
                 } else { // Jika record ada tapi bukan hari kerja -> LIBUR
                      detail.status = 'LIBUR';
                 }

            } else { // Tidak ada record
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
export async function getRekapBulanan(
  userId: string,
  tahun: number,
  bulan: number // Asumsi 0-11 (Januari=0, dst.)
): Promise<RekapBulan> {

    // Validasi Input
    if (!userId || typeof userId !== 'string' || isNaN(tahun) || isNaN(bulan) || bulan < 0 || bulan > 11) {
        console.error("[getRekapBulanan] Invalid parameters:", { userId, tahun, bulan });
        throw new Error('Parameter tidak valid untuk getRekapBulanan');
    }

    // Inisialisasi objek rekap (tambahkan counter opsional jika perlu)
    const rekap: RekapBulan = {
        totalHadir: 0, totalTerlambat: 0, totalAlpha: 0,
        totalHariKerja: 0, detailPerHari: []
        // totalIzin: 0, totalSakit: 0, totalCuti: 0, // Aktifkan jika ingin hitung ini
    };

    // Tentukan rentang tanggal (UTC agar konsisten)
    const tanggalAwalBulan = new Date(Date.UTC(tahun, bulan, 1, 0, 0, 0, 0));
    const tanggalAkhirBulan = new Date(Date.UTC(tahun, bulan + 1, 0, 23, 59, 59, 999));
    const today = new Date(); // Waktu lokal server untuk perbandingan
    today.setHours(0, 0, 0, 0);

    console.log(`[getRekapBulanan] Generating recap for User: ${userId}, Period: ${tanggalAwalBulan.toISOString()} - ${tanggalAkhirBulan.toISOString()}`);

    try {
        // 1. Ambil semua record absensi dalam rentang bulan
        const recordsBulanIni = await prisma.attendanceRecord.findMany({
            where: {
                userId: userId,
                clockIn: { gte: tanggalAwalBulan, lte: tanggalAkhirBulan }
            },
            orderBy: { clockIn: 'asc' },
            // Select field yang dibutuhkan
            select: { id: true, clockIn: true, clockOut: true, userId: true, status: true, notes: true, latitudeIn: true, longitudeIn: true, latitudeOut: true, longitudeOut: true }
        });
        console.log(`[getRekapBulanan] Found ${recordsBulanIni.length} records in DB.`);

        // 2. Buat Map untuk akses cepat berdasarkan tanggal (kunci YYYY-MM-DD dari waktu lokal server)
        const recordsMap = new Map<string, typeof recordsBulanIni[0]>();
        recordsBulanIni.forEach(record => {
            const clockInDate = new Date(record.clockIn);
            const dateKey = `${clockInDate.getFullYear()}-${(clockInDate.getMonth() + 1).toString().padStart(2, '0')}-${clockInDate.getDate().toString().padStart(2, '0')}`;
            recordsMap.set(dateKey, record);
        });

        // 3. Iterasi setiap hari dalam bulan
        const iteratorTanggal = new Date(tanggalAwalBulan);
        while (iteratorTanggal <= tanggalAkhirBulan && iteratorTanggal.getUTCMonth() === bulan) { // Gunakan getUTCMonth karena iterator UTC
            // Buat tanggal lokal untuk pengecekan hari kerja & perbandingan today
             // Penting: Buat objek Date baru untuk tanggalCek agar tidak memodifikasi iteratorTanggal
             // Kita gunakan komponen Waktu Lokal Server (bukan UTC) untuk cek isHariKerja dan bandingkan dengan 'today'
             // Asumsi server berjalan di timezone WITA (sesuai config.ts)
             const tgl = iteratorTanggal.getUTCDate();
             const bln = iteratorTanggal.getUTCMonth();
             const thn = iteratorTanggal.getUTCFullYear();
             // Buat objek Date baru merepresentasikan hari lokal (timestamp bisa jadi berbeda dari iteratorTanggal UTC)
             const tanggalCek = new Date(thn, bln, tgl); // Ini akan sesuai timezone server
             tanggalCek.setHours(0,0,0,0);


            // Buat kunci YYYY-MM-DD dari tanggal lokal
            const dateKey = `${tanggalCek.getFullYear()}-${(tanggalCek.getMonth() + 1).toString().padStart(2, '0')}-${tanggalCek.getDate().toString().padStart(2, '0')}`;
            const isWorkingDay = isHariKerja(tanggalCek);

            // === LOGGING ITERASI ===
            console.log(`\n[getRekapBulanan] Processing Date: ${dateKey} (UTC Date: ${iteratorTanggal.toISOString().split('T')[0]}), isWorkingDay: ${isWorkingDay}`);

            // Tentukan status default awal
            let statusHariIni: StatusAbsensiHarian = isWorkingDay ? (tanggalCek > today ? 'BELUM' : AttendanceStatus.ALPHA) : 'LIBUR';
            let clockInHariIni: Date | null = null;
            let clockOutHariIni: Date | null = null;
            let latIn: Prisma.Decimal | null = null, lonIn: Prisma.Decimal | null = null, latOut: Prisma.Decimal | null = null, lonOut: Prisma.Decimal | null = null;
            let notesHariIni: string | null = null;

            // Cari record di map berdasarkan dateKey (dari tanggal lokal)
            const recordHariIni = recordsMap.get(dateKey);
            console.log(`[getRekapBulanan] Record found in map for ${dateKey}?`, !!recordHariIni);
            if(recordHariIni){
                console.log(`[getRekapBulanan] Record Details for ${dateKey}: Status=${recordHariIni.status}, ClockIn=${recordHariIni.clockIn?.toISOString()}, ClockOut=${recordHariIni.clockOut?.toISOString()}`);
            }

            // Logika utama hanya berjalan untuk hari kerja yang sudah atau sedang berlalu
            if (isWorkingDay && tanggalCek <= today) {
                rekap.totalHariKerja++; // Tambah total hari kerja efektif
                console.log(`[getRekapBulanan] Incrementing totalHariKerja to ${rekap.totalHariKerja} for ${dateKey}`);

                if (recordHariIni) { // Jika ada record absensi untuk hari ini
                    clockInHariIni = recordHariIni.clockIn;
                    clockOutHariIni = recordHariIni.clockOut;
                    latIn = recordHariIni.latitudeIn; lonIn = recordHariIni.longitudeIn;
                    latOut = recordHariIni.latitudeOut; lonOut = recordHariIni.longitudeOut;
                    notesHariIni = recordHariIni.notes;

                    // Tetapkan status final untuk ditampilkan di detail harian (dari DB)
                    statusHariIni = recordHariIni.status as StatusAbsensiHarian;

                    // === AWAL PERBAIKAN PERHITUNGAN TOTAL (Versi 2) ===
                    switch (recordHariIni.status) {
                        case AttendanceStatus.HADIR:
                        case AttendanceStatus.SELESAI: // Anggap SELESAI = Hadir (untuk total)
                            // Cek keterlambatan berdasarkan clockIn
                            if (recordHariIni.clockIn) {
                                const batasTerlambat = getBatasTerlambat(tanggalCek);
                                if (recordHariIni.clockIn > batasTerlambat) {
                                    rekap.totalTerlambat++;
                                    console.log(`[getRekapBulanan] Incrementing totalTerlambat for ${dateKey} (Status: ${recordHariIni.status}). New total: ${rekap.totalTerlambat}`);
                                } else {
                                    rekap.totalHadir++;
                                    console.log(`[getRekapBulanan] Incrementing totalHadir for ${dateKey} (Status: ${recordHariIni.status}). New total: ${rekap.totalHadir}`);
                                }
                            } else { // Anomali: status hadir/selesai tapi tak ada clockIn
                                console.warn(`[getRekapBulanan] Status ${recordHariIni.status} but clockIn is null for ${dateKey}. Counting as ALPHA.`);
                                rekap.totalAlpha++;
                            }
                            break;
                        case AttendanceStatus.TERLAMBAT:
                            rekap.totalTerlambat++;
                            console.log(`[getRekapBulanan] Incrementing totalTerlambat for ${dateKey} (Status: ${recordHariIni.status}). New total: ${rekap.totalTerlambat}`);
                            break;
                        case AttendanceStatus.ALPHA:
                            rekap.totalAlpha++;
                            console.log(`[getRekapBulanan] Incrementing totalAlpha for ${dateKey} (Status: ALPHA). New total: ${rekap.totalAlpha}`);
                            break;
                        // Status yang diinput manual, tidak masuk hitungan Hadir/Terlambat/Alpha
                        case AttendanceStatus.IZIN:
                            console.log(`[getRekapBulanan] Status IZIN for ${dateKey}, not counted in main totals.`);
                            // rekap.totalIzin++; // Jika ada counter terpisah
                            break;
                        case AttendanceStatus.SAKIT:
                             console.log(`[getRekapBulanan] Status SAKIT for ${dateKey}, not counted in main totals.`);
                             // rekap.totalSakit++; // Jika ada counter terpisah
                             break;
                        case AttendanceStatus.CUTI:
                             console.log(`[getRekapBulanan] Status CUTI for ${dateKey}, not counted in main totals.`);
                             // rekap.totalCuti++; // Jika ada counter terpisah
                             break;
                        default:
                            // Jika status dari DB tidak dikenal
                            console.warn(`[getRekapBulanan] Unknown status '${recordHariIni.status}' for ${dateKey}. Counting as ALPHA.`);
                            rekap.totalAlpha++;
                    }
                    // === AKHIR PERBAIKAN PERHITUNGAN TOTAL ===

                } else { // Tidak ada record absensi untuk hari kerja ini
                    statusHariIni = AttendanceStatus.ALPHA; // Tetapkan status ALPHA
                    rekap.totalAlpha++;
                     console.log(`[getRekapBulanan] Assigning ALPHA, Incrementing totalAlpha for ${dateKey} (No record found). New total: ${rekap.totalAlpha}`);
                }
            } else { // Jika bukan hari kerja atau hari di masa depan
                // Status sudah diatur di awal ('LIBUR' atau 'BELUM')
                 console.log(`[getRekapBulanan] Final status for ${dateKey}: ${statusHariIni} (Not a processed working day / Libur / Future)`);
            }

            // Masukkan detail hari ini ke array hasil rekap
            rekap.detailPerHari.push({
                tanggal: new Date(Date.UTC(tanggalCek.getFullYear(), tanggalCek.getMonth(), tanggalCek.getDate())), // Simpan tanggal UTC
                status: statusHariIni,
                clockIn: clockInHariIni,
                clockOut: clockOutHariIni,
                latitudeIn: latIn, longitudeIn: lonIn,
                latitudeOut: latOut, longitudeOut: lonOut,
                notes: notesHariIni // Sertakan notes
            });

            // Lanjut ke hari berikutnya (iterator menggunakan UTC)
            iteratorTanggal.setUTCDate(iteratorTanggal.getUTCDate() + 1);
        } // Akhir loop while

        console.log(`[getRekapBulanan] Finished processing for User: ${userId}. Totals: Hadir=${rekap.totalHadir}, Terlambat=${rekap.totalTerlambat}, Alpha=${rekap.totalAlpha}, HariKerja=${rekap.totalHariKerja}`);
        return rekap; // Kembalikan hasil rekap

    } catch (error) {
        console.error(`[getRekapBulanan Error] User: ${userId}, Year: ${tahun}, Month: ${bulan}:`, error);
        // Lemparkan error agar bisa ditangani oleh API route
        throw new Error('Gagal menghasilkan rekap bulanan.');
    }
}
// --- AKHIR getRekapBulanan ---