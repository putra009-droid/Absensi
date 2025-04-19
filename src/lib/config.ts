// src/lib/config.ts

export const WAKTU_SERVER = 'Asia/Makassar'; // Sesuaikan dengan zona waktu server/lokasi Anda (WITA)

export const JAM_MASUK = 8;
export const MENIT_MASUK = 0;
export const MENIT_TOLERANSI_TERLAMBAT = 15;

// 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
export const HARI_KERJA_INDICES = [1, 2, 3, 4, 5]; // Senin sampai Jumat

// Fungsi helper untuk mendapatkan batas waktu terlambat pada tanggal tertentu
export function getBatasTerlambat(tanggal: Date): Date {
  const batas = new Date(tanggal);
  batas.setHours(JAM_MASUK, MENIT_MASUK + MENIT_TOLERANSI_TERLAMBAT, 0, 0); // Set ke 08:15:00:00
  return batas;
}

// Fungsi helper untuk cek apakah suatu tanggal adalah hari kerja
export function isHariKerja(tanggal: Date): boolean {
    // Perlu penyesuaian jika server/database tidak otomatis menangani WITA
    // Untuk amannya, kita bisa konversi dulu ke WITA jika perlu, tapi kita anggap Date sudah benar
    const hariIndex = tanggal.getDay(); // 0 = Minggu, ..., 6 = Sabtu
    return HARI_KERJA_INDICES.includes(hariIndex);
}