// Lokasi File: prisma/seed.ts

import { PrismaClient, Role } from '@prisma/client'; // Import Prisma Client dan Enum Role
import bcrypt from 'bcrypt'; // Import bcrypt untuk hashing password

// Buat instance Prisma Client
const prisma = new PrismaClient();

// Fungsi utama yang akan dijalankan untuk seeding
async function main() {
  console.log(`Mulai proses seeding data awal...`); // Pesan awal

  // --- Persiapan Password Default (Contoh) ---
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);
  console.log('--> Hash password default selesai dibuat.');

  // --- Membuat User Awal ---
  console.log('--> Memproses seeding Users...');

  // 1. Buat/Cek Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@absensi.app' },
    update: {},
    create: {
      email: 'superadmin@absensi.app',
      name: 'Super Administrator',
      password: defaultPasswordHash,
      role: Role.SUPER_ADMIN,
    },
  });
  console.log(`----> User: ${superAdmin.email} (${superAdmin.role})`);

  // 2. Buat/Cek Rektor
  const rektor = await prisma.user.upsert({
    where: { email: 'rektor@absensi.app' },
    update: {},
    create: {
      email: 'rektor@absensi.app',
      name: 'Nama Rektor',
      password: defaultPasswordHash,
      role: Role.REKTOR,
    },
  });
  console.log(`----> User: ${rektor.email} (${rektor.role})`);

  // 3. Buat/Cek Yayasan
  const yayasan = await prisma.user.upsert({
    where: { email: 'yayasan@absensi.app' },
    update: {},
    create: {
      email: 'yayasan@absensi.app',
      name: 'Perwakilan Yayasan',
      password: defaultPasswordHash,
      role: Role.YAYASAN,
    },
  });
  console.log(`----> User: ${yayasan.email} (${yayasan.role})`);

  // 4. Buat/Cek PR1
  const pr1 = await prisma.user.upsert({
    where: { email: 'pr1@absensi.app' },
    update: {},
    create: {
      email: 'pr1@absensi.app',
      name: 'Pembantu Rektor 1',
      password: defaultPasswordHash,
      role: Role.PR1,
    },
  });
  console.log(`----> User: ${pr1.email} (${pr1.role})`);

  // 5. Buat/Cek PR2
  const pr2 = await prisma.user.upsert({
    where: { email: 'pr2@absensi.app' },
    update: {},
    create: {
      email: 'pr2@absensi.app',
      name: 'Pembantu Rektor 2',
      password: defaultPasswordHash,
      role: Role.PR2,
    },
  });
  console.log(`----> User: ${pr2.email} (${pr2.role})`);

  // 6. Buat/Cek Employee Biasa (Contoh)
  const employee = await prisma.user.upsert({
    where: { email: 'staf@absensi.app' },
    update: {
        // Contoh: Jika ingin memastikan nama selalu terupdate saat seed ulang
        // name: 'Staf Biasa Updated',
    },
    create: {
      email: 'staf@absensi.app',
      name: 'Staf Biasa',
      password: defaultPasswordHash,
      role: Role.EMPLOYEE,
      baseSalary: 3000000.00, // Contoh penambahan Gaji Pokok
    },
  });
  console.log(`----> User: ${employee.email} (${employee.role})`);


  // ===============================================
  // === BAGIAN BARU: Seed AllowanceType ===
  // ===============================================
  console.log('--> Memproses seeding Allowance Types...');
  const allowanceTypesData = [
    { name: 'Tunjangan Makan', description: 'Tunjangan harian untuk makan siang', isFixed: false },
    { name: 'Tunjangan Transportasi', description: 'Tunjangan bulanan untuk transportasi', isFixed: true },
    { name: 'Tunjangan Jabatan', description: 'Tunjangan berdasarkan level jabatan', isFixed: true },
    { name: 'Tunjangan Komunikasi', description: 'Tunjangan pulsa/paket data', isFixed: true },
    { name: 'Tunjangan Hari Raya (THR)', description: 'Tunjangan tahunan saat hari raya', isFixed: true },
    { name: 'Tunjangan Keluarga', description: 'Tunjangan untuk status berkeluarga', isFixed: true }, // Contoh tambahan
  ];

  for (const typeData of allowanceTypesData) {
    const allowanceType = await prisma.allowanceType.upsert({
      where: { name: typeData.name }, // Gunakan nama sebagai unique identifier
      update: { // Update deskripsi/isFixed jika ada perubahan di script ini saat dijalankan ulang
        description: typeData.description,
        isFixed: typeData.isFixed,
      },
      create: { // Buat baru jika belum ada
        name: typeData.name,
        description: typeData.description,
        isFixed: typeData.isFixed,
      },
    });
    console.log(`----> Jenis Tunjangan: '${allowanceType.name}'`);
  }
  // ===============================================


  // --- (Opsional) Seed UserAllowance ---
  console.log('--> Memproses seeding User Allowances (Opsional)...');
  // Cari ID jenis tunjangan yang baru dibuat/dicek
  const tunjanganTransport = await prisma.allowanceType.findUnique({ where: { name: 'Tunjangan Transportasi' } });
  const tunjanganKomunikasi = await prisma.allowanceType.findUnique({ where: { name: 'Tunjangan Komunikasi' } });

  if (employee && tunjanganTransport) {
      // Tetapkan Tunjangan Transportasi ke 'staf@absensi.app'
      const uaTransport = await prisma.userAllowance.upsert({
          // Kunci unik komposit untuk upsert UserAllowance
          where: { userId_allowanceTypeId: { userId: employee.id, allowanceTypeId: tunjanganTransport.id } },
          update: { amount: 350000.00 }, // Update jumlah jika sudah ada
          create: { userId: employee.id, allowanceTypeId: tunjanganTransport.id, amount: 350000.00 }
      });
      console.log(`----> Tunjangan ${tunjanganTransport.name} (${uaTransport.amount.toString()}) -> ${employee.email}`);
  } else {
      console.log(`----> Gagal menetapkan Tunjangan Transportasi ke ${employee?.email} (User atau Tipe tidak ditemukan)`);
  }

   if (employee && tunjanganKomunikasi) {
      // Tetapkan Tunjangan Komunikasi ke 'staf@absensi.app'
      const uaKomunikasi = await prisma.userAllowance.upsert({
          where: { userId_allowanceTypeId: { userId: employee.id, allowanceTypeId: tunjanganKomunikasi.id } },
          update: {}, // Tidak update amount jika sudah ada
          create: { userId: employee.id, allowanceTypeId: tunjanganKomunikasi.id, amount: 100000.00 }
      });
      console.log(`----> Tunjangan ${tunjanganKomunikasi.name} (${uaKomunikasi.amount.toString()}) -> ${employee.email}`);
  } else {
      console.log(`----> Gagal menetapkan Tunjangan Komunikasi ke ${employee?.email} (User atau Tipe tidak ditemukan)`);
  }

  // --- Akhir data opsional ---


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