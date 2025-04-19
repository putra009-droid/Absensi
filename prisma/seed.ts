// Lokasi File: prisma/seed.ts

import { PrismaClient, Role } from '@prisma/client'; // Import Prisma Client dan Enum Role
import bcrypt from 'bcrypt'; // Import bcrypt untuk hashing password

// Buat instance Prisma Client
const prisma = new PrismaClient();

// Fungsi utama yang akan dijalankan untuk seeding
async function main() {
  console.log(`Mulai proses seeding data awal...`); // Pesan awal

  // --- Persiapan Password Default (Contoh) ---
  // GANTI 'Password123!' dengan password awal yang lebih kompleks jika Anda mau,
  // tapi ingat password ini saat login nanti.
  // Angka 10 adalah 'salt rounds' untuk bcrypt.
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);
  console.log('--> Hash password default selesai dibuat.');

  // --- Membuat User Awal ---
  // Menggunakan 'upsert':
  // - 'where': Mencari user berdasarkan kriteria unik (email).
  // - 'update': Jika user ditemukan, apa yang mau diupdate (kita kosongkan: {}).
  // - 'create': Jika user TIDAK ditemukan, data ini yang akan digunakan untuk membuat user baru.
  // Ini memastikan script bisa dijalankan berulang kali tanpa membuat duplikat user.

  // 1. Buat/Cek Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@absensi.app' }, // Email unik sebagai Kunci pencarian
    update: {},                                 // Jika ada, tidak diubah
    create: {                                   // Jika tidak ada, buat baru
      email: 'superadmin@absensi.app',
      name: 'Super Administrator',
      password: defaultPasswordHash,            // Gunakan hash password
      role: Role.SUPER_ADMIN,                   // Set role
    },
  });
  console.log(`--> User: <span class="math-inline">\{superAdmin\.email\} \(</span>{superAdmin.role})`);

  // 2. Buat/Cek Rektor
  const rektor = await prisma.user.upsert({
    where: { email: 'rektor@absensi.app' },
    update: {},
    create: {
      email: 'rektor@absensi.app',
      name: 'Nama Rektor',                     // Ganti dengan nama sebenarnya jika perlu
      password: defaultPasswordHash,
      role: Role.REKTOR,
    },
  });
  console.log(`--> User: <span class="math-inline">\{rektor\.email\} \(</span>{rektor.role})`);

  // 3. Buat/Cek Yayasan
  const yayasan = await prisma.user.upsert({
    where: { email: 'yayasan@absensi.app' },
    update: {},
    create: {
      email: 'yayasan@absensi.app',
      name: 'Perwakilan Yayasan',             // Ganti dengan nama sebenarnya jika perlu
      password: defaultPasswordHash,
      role: Role.YAYASAN,
    },
  });
  console.log(`--> User: <span class="math-inline">\{yayasan\.email\} \(</span>{yayasan.role})`);

  // 4. Buat/Cek PR1
  const pr1 = await prisma.user.upsert({
    where: { email: 'pr1@absensi.app' },
    update: {},
    create: {
      email: 'pr1@absensi.app',
      name: 'Pembantu Rektor 1',              // Ganti dengan nama sebenarnya jika perlu
      password: defaultPasswordHash,
      role: Role.PR1,
    },
  });
  console.log(`--> User: <span class="math-inline">\{pr1\.email\} \(</span>{pr1.role})`);

  // 5. Buat/Cek PR2
  const pr2 = await prisma.user.upsert({
    where: { email: 'pr2@absensi.app' },
    update: {},
    create: {
      email: 'pr2@absensi.app',
      name: 'Pembantu Rektor 2',              // Ganti dengan nama sebenarnya jika perlu
      password: defaultPasswordHash,
      role: Role.PR2,
    },
  });
  console.log(`--> User: <span class="math-inline">\{pr2\.email\} \(</span>{pr2.role})`);

  // 6. Buat/Cek Employee Biasa (Contoh)
  const employee = await prisma.user.upsert({
    where: { email: 'staf@absensi.app' },
    update: {},
    create: {
      email: 'staf@absensi.app',
      name: 'Staf Biasa',                     // Ganti dengan nama sebenarnya jika perlu
      password: defaultPasswordHash,
      role: Role.EMPLOYEE,                   // Role default
    },
  });
  console.log(`--> User: <span class="math-inline">\{employee\.email\} \(</span>{employee.role})`);

  // --- Tambahkan data lain di sini jika perlu ---
  // Misalnya, membuat data absensi awal untuk testing

  console.log(`Seeding data awal selesai.`); // Pesan Selesai
}

// Menjalankan fungsi 'main' dan menangani jika ada error
main()
  .then(async () => {
    // Jika sukses, tutup koneksi Prisma
    await prisma.$disconnect();
    console.log('Koneksi Prisma ditutup.');
  })
  .catch(async (e) => {
    // Jika error, tampilkan error, tutup koneksi, dan keluar dengan kode error
    console.error('Terjadi error saat menjalankan seeding:', e);
    await prisma.$disconnect();
    console.log('Koneksi Prisma ditutup karena error.');
    process.exit(1);
  });