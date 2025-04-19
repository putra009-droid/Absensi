// Lokasi File: src/app/admin/users/edit/[userId]/page.tsx
'use client'; // Ubah menjadi Client Component untuk pakai hooks

import { useState, useEffect } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation'; // Import useParams & notFound
import { useSession } from 'next-auth/react'; // Import useSession
import { Role, User } from '@prisma/client'; // Import tipe User & Role
import EditUserForm from './_components/EditUserForm'; // Import komponen form

// Tipe data user yang dibutuhkan
type UserEditData = Pick<User, 'id' | 'name' | 'email' | 'role'> | null;

// Komponen Halaman Edit (Client Component)
export default function EditUserPage() {
  const router = useRouter();
  const params = useParams(); // Hook untuk mendapatkan ID dari URL
  const { data: session, status: sessionStatus } = useSession(); // Hook untuk sesi

  // State untuk data user, loading, dan error
  const [userData, setUserData] = useState<UserEditData>(null);
  const [isLoading, setIsLoading] = useState(true); // Loading awal
  const [error, setError] = useState<string | null>(null);

  // Ambil userId dari params
  const userId = typeof params?.userId === 'string' ? params.userId : null;

  // Efek untuk cek otorisasi (Super Admin)
  useEffect(() => {
    if (sessionStatus !== 'loading' && (sessionStatus !== 'authenticated' || session?.user?.role !== Role.SUPER_ADMIN)) {
      console.warn('Akses ditolak (Client Side): Bukan Super Admin atau belum login.');
      router.replace('/admin/users'); // Redirect jika bukan Super Admin
    }
  }, [sessionStatus, session, router]);

  // Efek untuk fetch data user awal dari API GET
  useEffect(() => {
    // Hanya fetch jika ID ada DAN sesi sudah siap & user adalah Super Admin
    if (userId && sessionStatus === 'authenticated' && session?.user?.role === Role.SUPER_ADMIN) {
      setIsLoading(true);
      setError(null);

      fetch(`/api/admin/users/${userId}`) // Panggil API GET
        .then(async (res) => {
          if (res.status === 404) { notFound(); return; } // Handle 404
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: `Gagal mengambil data (status: ${res.status})` }));
            throw new Error(errorData.message || 'Gagal mengambil data pengguna.');
          }
          return res.json(); // Ambil data JSON jika sukses
        })
        .then((data: UserEditData) => {
          setUserData(data); // Simpan data ke state
        })
        .catch((err: any) => {
          console.error("Fetch user data error:", err);
          setError(err.message); // Simpan error ke state
          setUserData(null);
        })
        .finally(() => {
          setIsLoading(false); // Selesai loading
        });
    } else if (sessionStatus !== 'loading') {
      // Jika tidak memenuhi syarat fetch (misal belum login), set loading false
      setIsLoading(false);
    }
  }, [userId, sessionStatus, session]); // Dijalankan jika userId atau sesi berubah

  // Tampilan Loading
  if (isLoading || sessionStatus === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Memuat data pengguna...</div>;
  }

  // Tampilan Error Fetch
  if (error) {
     return (
        <div className="min-h-screen bg-gray-100 p-8 text-center">
            <p className="text-red-600 bg-red-100 p-3 rounded">{error}</p>
            <Link href="/admin/users" className="text-blue-600 hover:underline mt-4 inline-block">
              Kembali ke Daftar Pengguna
            </Link>
        </div>
     );
  }

  // Tampilan jika user tidak ditemukan atau tidak berwenang
  if (!userData) {
     if(sessionStatus === 'unauthenticated'){ return <div className="flex items-center justify-center min-h-screen">Anda harus login sebagai Super Admin.</div>; }
     return <div className="flex items-center justify-center min-h-screen">Pengguna tidak ditemukan atau Anda tidak berwenang.</div>;
  }

  // Render Halaman Edit dengan Form jika semua OK
  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 border-b pb-3">
          Edit Pengguna: <span className="font-normal">{userData.name || userData.email}</span>
        </h1>
        {/* Render komponen form, kirim data user dari state */}
        <EditUserForm userData={userData} />
      </div>
    </div>
  );
}