// Lokasi File: src/app/admin/users/edit/[userId]/page.tsx
'use client'; // <-- Tandai sebagai Client Component

import { useState, useEffect } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation'; // Import hooks client
import { useSession } from 'next-auth/react'; // Import useSession untuk cek sesi di client
import { Role, User } from '@prisma/client'; // Import tipe Role & User
import EditUserForm from './_components/EditUserForm'; // Import komponen form
import Link from 'next/link'; // Import Link

// Tipe data untuk state user (termasuk baseSalary dari API yang sudah diserialize)
type UserEditData = Pick<User, 'id' | 'name' | 'email' | 'role'> & { baseSalary?: string | null } | null;

// Komponen Halaman Edit (Client Component)
export default function EditUserPage() {
  const router = useRouter();
  const params = useParams(); // Hook untuk mendapatkan parameter dari URL
  const { data: session, status: sessionStatus } = useSession(); // Hook untuk mendapatkan data sesi

  // State lokal untuk data pengguna, status loading, dan error
  const [userData, setUserData] = useState<UserEditData>(null);
  const [isLoadingData, setIsLoadingData] = useState(true); // Loading untuk fetch data awal
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Ambil userId dari params. Perlu di-cast ke string atau cek tipenya.
  const userId = typeof params?.userId === 'string' ? params.userId : null;

  // --- Efek Samping (useEffect) ---

  // 1. Efek untuk memeriksa otorisasi (Super Admin)
  useEffect(() => {
    // Jalankan hanya jika status sesi tidak lagi loading
    if (sessionStatus !== 'loading') {
      // Jika tidak terautentikasi atau role bukan Super Admin
      if (sessionStatus !== 'authenticated' || session?.user?.role !== Role.SUPER_ADMIN) {
        console.warn('[EditPage] Akses ditolak: Bukan Super Admin atau belum login.');
        // Redirect ke halaman daftar user jika tidak berwenang
        router.replace('/admin/users');
      }
    }
  }, [sessionStatus, session, router]); // Dijalankan ulang jika sesi atau router berubah

  // 2. Efek untuk mengambil data pengguna awal dari API
  useEffect(() => {
    // Hanya jalankan fetch jika:
    // - userId sudah didapat dari URL
    // - Sesi sudah siap (authenticated)
    // - Pengguna adalah Super Admin
    if (userId && sessionStatus === 'authenticated' && session?.user?.role === Role.SUPER_ADMIN) {
      setIsLoadingData(true); // Mulai loading
      setFetchError(null); // Reset error sebelumnya

      console.log(`[EditPage] Fetching user data for ID: ${userId} using /user-detail API`);

      // Panggil API GET non-dinamis (/api/admin/user-detail?id=...)
      fetch(`/api/admin/user-detail?id=${userId}`)
        .then(async (res) => {
            console.log(`[EditPage] User Detail API Response Status: ${res.status}`);
            // Handle jika user tidak ditemukan oleh API (404)
            if (res.status === 404) {
                notFound(); // Tampilkan halaman 404 Next.js
                return; // Hentikan eksekusi .then berikutnya
            }
            // Handle jika ada error server lain
            if (!res.ok) {
                // Coba baca pesan error dari response body
                const errData = await res.json().catch(()=>({ message: `Gagal fetch data (status: ${res.status})` }));
                throw new Error(errData.message || 'Gagal mengambil data pengguna.');
            }
            // Jika response OK (200), parse JSON
            return res.json();
         })
        .then((data: UserEditData) => { // Terima data (baseSalary sudah string/null dari API)
            console.log("[EditPage] User data fetched:", data);
            // Validasi sederhana struktur data
            if(!data || typeof data !== 'object' || !data.id){
                throw new Error("Format data pengguna dari API tidak valid.");
            }
            setUserData(data); // Simpan data pengguna ke state
        })
        .catch((err: any) => {
            // Tangkap error dari fetch atau .then di atasnya
            console.error("[EditPage] Fetch user data error:", err);
            setFetchError(err.message); // Simpan pesan error ke state
            setUserData(null); // Kosongkan data user jika error
         })
        .finally(() => {
            setIsLoadingData(false); // Selesai loading (baik sukses maupun gagal)
        });
    } else if (sessionStatus !== 'loading') {
      // Jika sesi tidak loading tapi tidak memenuhi syarat fetch, hentikan loading
      setIsLoadingData(false);
    }
  }, [userId, sessionStatus, session]); // Jalankan ulang jika userId atau status sesi berubah

  // --- Tampilan Kondisional (Loading, Error, Belum Login) ---
  if (isLoadingData || sessionStatus === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Memuat data pengguna...</div>;
  }
  // Jika status bukan authenticated (setelah loading selesai), tampilkan pesan akses
  if (sessionStatus !== 'authenticated' || session?.user?.role !== Role.SUPER_ADMIN) {
    return <div className="flex items-center justify-center min-h-screen">Mengalihkan atau akses ditolak...</div>;
  }
  // Tampilkan pesan error jika fetch gagal
  if (fetchError) {
     return (
        <div className="min-h-screen bg-gray-100 p-8 text-center">
            <p className="text-red-600 bg-red-100 p-3 rounded mb-4">{fetchError}</p>
            <Link href="/admin/users" className="text-blue-600 hover:underline mt-4 inline-block">
              Kembali ke Daftar Pengguna
            </Link>
        </div>
     );
  }
  // Tampilkan pesan jika data user tidak ada setelah loading selesai & tidak error
  if (!userData) {
     return <div className="flex items-center justify-center min-h-screen">Pengguna tidak ditemukan atau gagal memuat data.</div>;
  }

  // --- Render Halaman Edit dengan Form Jika Semua OK ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
        <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-md">
            <h1 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3">
                {/* Judul Halaman */}
                Edit Pengguna: <span className="font-normal">{userData.name || userData.email}</span>
            </h1>
            {/* Render komponen form dan kirim data user dari state */}
            {/* userData di sini sudah berisi baseSalary (string/null) dari API */}
            <EditUserForm userData={userData} />
        </div>
    </div>
  );
}