// Contoh Lokasi File: src/components/TombolKhususAdmin.tsx
// (Anda perlu membuat folder 'components' di 'src/' jika belum ada)

'use client'; // Komponen ini berjalan di client

import { useSession } from 'next-auth/react'; // Hook untuk ambil sesi di client
// import { Role } from '@prisma/client'; // Import jika ingin perbandingan enum, tapi string juga bisa

export default function TombolKhususAdmin() {
  // Ambil data sesi, status loading, dll.
  const { data: session, status } = useSession();

  // Jika masih loading data sesi, tampilkan pesan loading
  if (status === 'loading') {
    return <span className="text-sm text-gray-500">Memeriksa akses...</span>;
  }

  // Jika pengguna login DAN rolenya adalah 'SUPER_ADMIN'
  // Perbandingan dengan string 'SUPER_ADMIN' di sini aman untuk UI
  // karena data role di sesi sudah didapat dari token yang dibuat server
  if (session?.user?.role === 'SUPER_ADMIN') { // atau session?.user?.role === Role.SUPER_ADMIN
    return (
      <button className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700">
        Panel Super Admin
      </button>
    );
  }

  // Jika tidak login atau bukan SUPER_ADMIN, jangan tampilkan tombol ini
  return null;
}