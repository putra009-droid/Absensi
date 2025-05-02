// src/lib/config.ts
// Versi yang membaca pengaturan absensi dari database

import { prisma } from '@/lib/prisma'; // Pastikan prisma diimpor dari lokasi yang benar

// --- Zona Waktu Server (Tetap) ---
export const WAKTU_SERVER = 'Asia/Makassar'; // Sesuaikan jika perlu

// --- Nilai Default (Digunakan jika DB error atau belum ada setting) ---
const DEFAULT_JAM_MASUK = 8; // Default jika tidak ada di DB
const DEFAULT_MENIT_MASUK = 0;
const DEFAULT_TOLERANSI_MENIT = 15;
const SETTINGS_ID = "global_settings"; // ID tetap untuk pengaturan global

// --- Cache Sederhana ---
// Variabel untuk menyimpan cache pengaturan
let cachedSettings: {
    hour: number;
    minute: number;
    tolerance: number;
    timestamp: number; // Waktu cache dibuat
} | null = null;
// Durasi cache dalam milidetik (contoh: 5 menit)
const CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * Mengambil pengaturan jam kerja (jam masuk, menit masuk, toleransi)
 * dari database atau cache. Menggunakan nilai default jika terjadi error atau setting belum ada.
 * Akan mencoba membuat setting default jika tidak ditemukan.
 * @returns {Promise<{hour: number, minute: number, tolerance: number}>}
 */
async function getAttendanceSettings(): Promise<{hour: number, minute: number, tolerance: number}> {
    const now = Date.now();

    // 1. Cek Cache
    if (cachedSettings && (now - cachedSettings.timestamp < CACHE_DURATION_MS)) {
        // console.log("[getAttendanceSettings] Menggunakan pengaturan dari cache."); // Uncomment untuk debug cache
        return {
            hour: cachedSettings.hour,
            minute: cachedSettings.minute,
            tolerance: cachedSettings.tolerance
        };
    }

    console.log("[getAttendanceSettings] Mengambil pengaturan dari database...");
    try {
        // 2. Ambil dari Database
        let settings = await prisma.attendanceSetting.findUnique({
            where: { id: SETTINGS_ID },
        });

        // 3. Jika tidak ada di DB (misal baru deploy/seed belum jalan), buat/gunakan default
        if (!settings) {
            console.warn("[getAttendanceSettings] Pengaturan tidak ditemukan di DB, mencoba membuat/menggunakan default.");
            try {
                // Coba buat record default jika belum ada (gunakan upsert untuk keamanan)
                settings = await prisma.attendanceSetting.upsert({
                     where: { id: SETTINGS_ID },
                     update: {}, // Tidak update jika ada
                     create: {
                         id: SETTINGS_ID,
                         workStartTimeHour: DEFAULT_JAM_MASUK,
                         workStartTimeMinute: DEFAULT_MENIT_MASUK,
                         lateToleranceMinutes: DEFAULT_TOLERANSI_MENIT,
                     }
                });
                 console.log("[getAttendanceSettings] Pengaturan default berhasil dibuat/dipastikan ada di DB.");
            } catch (createError) {
                 console.error("[getAttendanceSettings] Gagal membuat/memastikan pengaturan default, menggunakan nilai default hardcoded:", createError);
                 // Jika gagal create/upsert, gunakan default hardcoded
                 return {
                     hour: DEFAULT_JAM_MASUK,
                     minute: DEFAULT_MENIT_MASUK,
                     tolerance: DEFAULT_TOLERANSI_MENIT
                 };
            }
        }

         // console.log("[getAttendanceSettings] Menggunakan pengaturan dari DB:", settings); // Uncomment untuk debug nilai DB
         // 4. Simpan ke Cache
         cachedSettings = {
             hour: settings.workStartTimeHour,
             minute: settings.workStartTimeMinute,
             tolerance: settings.lateToleranceMinutes,
             timestamp: now
         };
         return {
             hour: settings.workStartTimeHour,
             minute: settings.workStartTimeMinute,
             tolerance: settings.lateToleranceMinutes
         };

    } catch (error) {
        // 5. Jika terjadi error saat query DB, gunakan default
        console.error("[getAttendanceSettings] Error mengambil pengaturan dari DB, menggunakan nilai default:", error);
        return {
            hour: DEFAULT_JAM_MASUK,
            minute: DEFAULT_MENIT_MASUK,
            tolerance: DEFAULT_TOLERANSI_MENIT
        };
    }
}


/**
 * Menghitung batas waktu akhir untuk dianggap tidak terlambat pada hari tertentu,
 * berdasarkan pengaturan dari database atau default.
 * Fungsi ini sekarang ASYNC karena perlu memanggil getAttendanceSettings().
 * @param date Tanggal saat ini (atau tanggal referensi)
 * @returns {Promise<Date>} Object Date yang merepresentasikan batas waktu terlambat.
 */
export async function getBatasTerlambat(date: Date): Promise<Date> {
    // Panggil fungsi async untuk mendapatkan pengaturan
    const settings = await getAttendanceSettings();

    const batas = new Date(date); // Salin tanggal saat ini
    // Set jam, menit (ditambah toleransi), detik, ms berdasarkan setting dari DB/cache/default
    batas.setHours(settings.hour, settings.minute + settings.tolerance, 0, 0);

    // Log hasil perhitungan (opsional untuk debug)
    // console.log(`[getBatasTerlambat] Batas waktu terlambat dihitung untuk ${date.toDateString()}: ${batas.toLocaleTimeString('id-ID')} (Setting: Jam ${settings.hour}, Menit ${settings.minute}, Toleransi ${settings.tolerance} menit)`);
    return batas;
}

// --- Konstanta dan Fungsi Lain (Tetap) ---
// Konstanta lama untuk jam masuk/toleransi sudah tidak dipakai oleh getBatasTerlambat
// Anda bisa menghapusnya jika tidak ada kode lain yang masih memakainya.
// export const JAM_MASUK = 10;
// export const MENIT_MASUK = 0;
// export const MENIT_TOLERANSI_TERLAMBAT = 15;

// 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
export const HARI_KERJA_INDICES = [1, 2, 3, 4, 5]; // Senin sampai Jumat

// Fungsi helper untuk cek apakah suatu tanggal adalah hari kerja (tetap sama)
export function isHariKerja(tanggal: Date): boolean {
    const hariIndex = tanggal.getDay(); // 0 = Minggu, ..., 6 = Sabtu
    return HARI_KERJA_INDICES.includes(hariIndex);
}

// Contoh konstanta lain yang mungkin masih relevan
export const REQUIRED_DISTANCE_METERS = 100; // Contoh batas jarak
// ...konstanta lain...

