// Lokasi File: src/app/admin/users/edit/[userId]/page.tsx
'use client'; // Komponen ini perlu state dan hook sisi klien

import { useState, useEffect } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Role, User } from '@prisma/client'; // Import tipe dari Prisma
import EditUserForm from './_components/EditUserForm'; // Import komponen form utama (Pastikan path ini benar)
import Link from 'next/link';
import { toast } from 'sonner'; // Pastikan Anda sudah install dan setup sonner

// ===========================================================
// ===     IMPORT KOMPONEN BARU UserAllowancesSection      ===
// ===========================================================
// Pastikan path ini benar sesuai lokasi file komponen Anda
import { UserAllowancesSection } from '@/components/admin/UserAllowancesSection';
// ===========================================================


// Tipe data untuk state user yang akan diedit
// Memastikan baseSalary diterima sebagai string atau null dari API
type UserEditData = Pick<User, 'id' | 'name' | 'email' | 'role'> & {
     baseSalary?: string | null
} | null;

export default function EditUserPage() {
     const router = useRouter();
     const params = useParams();
     const { data: session, status: sessionStatus } = useSession();

     const [userData, setUserData] = useState<UserEditData>(null);
     const [isLoadingData, setIsLoadingData] = useState(true);
     const [fetchError, setFetchError] = useState<string | null>(null);

     // Ambil userId dari params (hook client-side)
     const userId = typeof params?.userId === 'string' ? params.userId : null;

     // 1. Efek untuk cek otorisasi Super Admin
     useEffect(() => {
         if (sessionStatus === 'authenticated') {
             if (session?.user?.role !== Role.SUPER_ADMIN) {
                 console.warn('[EditPage] Akses ditolak: Bukan Super Admin.');
                 toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
                 router.replace('/admin/users'); // Redirect jika tidak berwenang
             }
         } else if (sessionStatus === 'unauthenticated') {
              console.warn('[EditPage] Akses ditolak: Belum login.');
              toast.error("Silakan login sebagai Super Admin terlebih dahulu.");
              // Cek window sebelum redirect untuk Next.js App Router client component
              if (typeof window !== 'undefined') {
                  router.replace('/login?callbackUrl=' + encodeURIComponent(window.location.pathname)); // Redirect ke login
              }
         }
     }, [sessionStatus, session, router]);

     // 2. Efek untuk fetch data user awal dari API yang benar
     useEffect(() => {
         // Hanya fetch jika userId ada dan sesi sudah siap & user adalah Super Admin
         if (userId && sessionStatus === 'authenticated' && session?.user?.role === Role.SUPER_ADMIN) {
             setIsLoadingData(true);
             setFetchError(null);

             console.log(`[EditPage] Fetching user data for ID: ${userId}`);
             fetch(`/api/admin/users/${userId}`) // <<< Panggil API GET yang BENAR
                 .then(async (res) => {
                     console.log(`[EditPage] User Detail API Response Status: ${res.status}`);
                     if (res.status === 404) {
                         notFound(); // Trigger halaman 404 Next.js jika user ID tidak ditemukan oleh API
                         return null; // Kembalikan null agar .then berikutnya tidak error
                     }
                     if (!res.ok) {
                         // Coba ekstrak pesan error dari server
                         const errData = await res.json().catch(()=>({ message: `Gagal mengambil data (Status: ${res.status})` }));
                         throw new Error(errData.message || 'Gagal mengambil data pengguna.');
                     }
                     return res.json(); // Kembalikan data JSON jika OK
                 })
                 .then((data: UserEditData | null) => {
                     if (data) { // Hanya proses jika data tidak null (tidak 404)
                          console.log("[EditPage] User data fetched:", data);
                          if (typeof data !== 'object' || !data.id) {
                              throw new Error("Format data pengguna dari API tidak valid.");
                          }
                          setUserData(data); // Set state dengan data yang diterima
                     }
                     // Jika data null (karena 404), state userData tetap null
                 })
                 .catch((err: any) => {
                     console.error("[EditPage] Fetch user data error:", err);
                     setFetchError(err.message); // Tampilkan error fetch ke pengguna
                     setUserData(null);
                 })
                 .finally(() => {
                     setIsLoadingData(false); // Hentikan loading
                 });
         } else if (sessionStatus !== 'loading' && !userId) {
              // Handle jika userId tidak valid dari URL
              setFetchError("User ID tidak valid atau tidak ditemukan di URL.");
              setIsLoadingData(false);
         } else if (sessionStatus === 'unauthenticated' || (sessionStatus === 'authenticated' && session?.user?.role !== Role.SUPER_ADMIN)) {
              // Sesi tidak valid atau role salah, loading dihentikan, tunggu redirect dari efek pertama
              setIsLoadingData(false);
         }
     }, [userId, sessionStatus, session]); // Bergantung pada userId dan sesi

     // --- Tampilan Kondisional ---
     // Tampilkan loading jika data atau sesi sedang dimuat
     if (isLoadingData || sessionStatus === 'loading') {
         return <div className="flex items-center justify-center min-h-screen">Memuat...</div>;
     }

     // Tampilkan pesan jika sesi tidak valid (meskipun redirect sedang berjalan)
     if (sessionStatus !== 'authenticated' || session?.user?.role !== Role.SUPER_ADMIN) {
         return <div className="flex items-center justify-center min-h-screen">Akses ditolak.</div>;
     }

     // Tampilkan error jika fetch gagal
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

     // Tampilkan pesan jika data user tidak berhasil dimuat (setelah loading selesai & tidak error)
     // atau jika userId tidak valid (seharusnya sudah ditangani fetchError, tapi untuk keamanan)
     if (!userData || !userId) {
         // notFound() seharusnya sudah dipanggil jika 404, tapi ini sebagai fallback
         return <div className="flex items-center justify-center min-h-screen">Gagal memuat data pengguna atau pengguna tidak ditemukan.</div>;
     }

     // --- Render Halaman Edit Utama ---
     return (
         <div className="min-h-screen bg-gray-100 p-4 md:p-8">
             {/* Gunakan max-w-4xl atau sesuaikan agar cukup untuk form + tunjangan */}
             <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
                 <h1 className="text-2xl font-bold text-gray-900 mb-6 border-b border-gray-200 pb-4">
                     Edit Pengguna: <span className="font-normal">{userData.name || userData.email}</span>
                 </h1>

                 {/* Render komponen form utama untuk edit data user */}
                 <EditUserForm userData={userData} />

                 {/* --- Bagian untuk Mengelola Tunjangan --- */}
                 {/* Render komponen UserAllowancesSection, lewatkan userId */}
                 <UserAllowancesSection userId={userId} />
                 {/* --- Akhir Bagian Tunjangan --- */}

                 {/* Anda mungkin punya tombol kembali atau lainnya di sini */}
                 <div className="mt-8 border-t border-gray-200 pt-6 text-center">
                     <Link href="/admin/users" className="text-blue-600 hover:underline">
                        &larr; Kembali ke Daftar Pengguna
                     </Link>
                 </div>

             </div>
         </div>
     );
}