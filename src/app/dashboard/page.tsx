// Lokasi File: src/app/dashboard/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { Role, AttendanceStatus } from '@prisma/client'; // Import Role dan AttendanceStatus
import SignOutButton from '@/components/SignOutButton';
import AttendanceWidget from '@/components/AttendanceWidget';
import type { RekapBulan, DetailAbsensiHarian } from '@/lib/attendanceLogic'; // Import Tipe
import FilterRekap from './_components/FilterRekap';
import dynamic from 'next/dynamic';

// Impor Komponen Peta Secara Dinamis
const MapDisplay = dynamic(() => import('@/components/MapDisplay'), {
  ssr: false,
  loading: () => <div className="h-[80px] w-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs italic rounded-md">Memuat peta...</div>,
});

// Komponen Utama Halaman Dashboard
export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // State komponen
  const [attendanceInfoHariIni, setAttendanceInfoHariIni] = useState<DetailAbsensiHarian | null>(null);
  const [rekapBulanIni, setRekapBulanIni] = useState<RekapBulan | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [isLoadingRekap, setIsLoadingRekap] = useState<boolean>(true);
  const [errorRekap, setErrorRekap] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);

  // Efek Redirect jika tidak terautentikasi
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  // Efek Fetch Status Harian Awal (Memanggil API /api/attendance/status-harian)
   useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user?.id) {
        setIsLoadingStatus(true); setErrorStatus(null);
        const todayStr = new Date().toISOString().split('T')[0];
        console.log("[DashboardPage] Fetching status harian..."); // Log Fetch Status
        fetch(`/api/attendance/status-harian?date=${todayStr}`)
            .then(res => {
                console.log(`[DashboardPage] Status Harian API Response Status: ${res.status}`); // Log Status API
                if (!res.ok) {
                     // Coba baca pesan error dari body jika ada
                    return res.json().then(errData => { throw new Error(errData.message || 'Gagal fetch status harian'); });
                 }
                return res.json();
            })
            .then((response: { success: boolean, data?: DetailAbsensiHarian, message?: string }) => {
                 console.log("[DashboardPage] Raw Status Harian data from API:", response); // Log Data Mentah
                 if (response.success && response.data) {
                    const data = response.data;
                    // Konversi tanggal dari string ISO
                    setAttendanceInfoHariIni({
                        ...data,
                        tanggal: new Date(data.tanggal),
                        clockIn: data.clockIn ? new Date(data.clockIn) : null,
                        clockOut: data.clockOut ? new Date(data.clockOut) : null,
                         latitudeIn: data.latitudeIn !== null && data.latitudeIn !== undefined ? Number(data.latitudeIn) : null,
                         longitudeIn: data.longitudeIn !== null && data.longitudeIn !== undefined ? Number(data.longitudeIn) : null,
                         latitudeOut: data.latitudeOut !== null && data.latitudeOut !== undefined ? Number(data.latitudeOut) : null,
                         longitudeOut: data.longitudeOut !== null && data.longitudeOut !== undefined ? Number(data.longitudeOut) : null,
                    });
                 } else {
                     // Jika success false atau data tidak ada, lempar error dengan pesan dari API
                     throw new Error(response.message || 'Format data status harian tidak sesuai.');
                 }
            })
            .catch(err => {
                console.error("Fetch status harian error:", err);
                setErrorStatus(err.message);
                // Set default state jika error, pastikan tipenya sesuai DetailAbsensiHarian
                setAttendanceInfoHariIni({ tanggal: new Date(), status: 'LIBUR', clockIn: null, clockOut: null });
            })
            .finally(() => setIsLoadingStatus(false));
    } else if (sessionStatus !== 'loading') {
        // Jika sesi tidak loading dan tidak authenticated, set loading selesai
        setIsLoadingStatus(false);
    }
  }, [sessionStatus, session]);


  // Fungsi Fetch Rekap Bulanan (Memanggil API /api/attendance/recap)
   const fetchRekapData = useCallback(async (year: number, month: number) => {
     if (sessionStatus === 'authenticated') {
       setIsLoadingRekap(true); setErrorRekap(null);
       console.log(`[fetchRekapData] Fetching rekap for ${year}-${month}...`);
       try {
         const res = await fetch(`/api/attendance/recap?tahun=${year}&bulan=${month}`);
         console.log(`[fetchRekapData] Recap API Response Status: ${res.status}`);

         if (!res.ok) {
            let errorMsg = `Gagal mengambil data rekap (Status: ${res.status})`;
            try { const errData = await res.json(); errorMsg = errData.message || errorMsg; } catch (e) { /* abaikan */ }
            throw new Error(errorMsg);
          }

         const data = await res.json(); // Terima data (tanggal=string, lat/lon=number)
         console.log("[fetchRekapData] Raw Recap data from API:", JSON.stringify(data, null, 2));

         // Validasi struktur data dasar
         if (!data || !Array.isArray(data.detailPerHari)) { throw new Error("Format data rekap API tidak valid."); }

         // Konversi tipe data di client
         data.detailPerHari = data.detailPerHari.map((detail: any) => ({
            ...detail,
            tanggal: new Date(detail.tanggal),
            clockIn: detail.clockIn ? new Date(detail.clockIn) : null,
            clockOut: detail.clockOut ? new Date(detail.clockOut) : null,
            // Lat/lon sudah number dari API
         }));
         console.log("[fetchRekapData] Processed Recap data:", data);
         setRekapBulanIni(data); // Set state

       } catch (error: any) {
         console.error("[fetchRekapData] Error caught:", error);
         setErrorRekap(error.message || "Gagal memuat data rekap bulanan.");
         setRekapBulanIni(null); // Set null jika error
       } finally {
         setIsLoadingRekap(false);
         console.log("[fetchRekapData] Fetch finished.");
       }
     } else {
        console.log("[fetchRekapData] Skipped, session not authenticated.");
     }
   }, [sessionStatus, session]); // Tambahkan session sebagai dependensi useCallback

  // Efek untuk membaca searchParams dan memanggil fetchRekapData
  useEffect(() => {
      const now = new Date();
      const yearFromParams = parseInt(searchParams.get('tahun') || '', 10) || now.getFullYear();
      let monthFromParams = parseInt(searchParams.get('bulan') || '', 10);
      // Validasi monthFromParams
      if (isNaN(monthFromParams) || monthFromParams < 0 || monthFromParams > 11) {
        monthFromParams = now.getMonth();
      }
      console.log(`[DashboardPage] Params changed/loaded. Year: ${yearFromParams}, Month: ${monthFromParams}`);
      setSelectedYear(yearFromParams);
      setSelectedMonth(monthFromParams);
      // Panggil fetchRekapData hanya jika sesi sudah siap
      if (sessionStatus === 'authenticated') {
          fetchRekapData(yearFromParams, monthFromParams);
      } else {
          // Jika sesi belum siap, mungkin set loading rekap false
          setIsLoadingRekap(false);
          console.log("[DashboardPage] Skipping initial rekap fetch, session not ready.");
      }
  }, [searchParams, fetchRekapData, sessionStatus]); // Tambah sessionStatus sebagai dependensi


  // Efek untuk memantau perubahan state rekapBulanIni (untuk debug)
  useEffect(() => { console.log("[DashboardPage] State rekapBulanIni updated:", rekapBulanIni); }, [rekapBulanIni]);


  // Fungsi helper nama bulan
  const getNamaBulan = (bulanIndex: number, tahun: number): string => { return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(tahun, bulanIndex)); };

  // Tampilan Loading Awal / Unauthenticated
  if (sessionStatus === 'loading') { return <div className="flex items-center justify-center min-h-screen">Memuat sesi...</div>; }
  if (sessionStatus === 'unauthenticated') { return <div className="flex items-center justify-center min-h-screen">Mengalihkan ke halaman login...</div>; }
  if (!session?.user) { return <div className="flex items-center justify-center min-h-screen">Sesi tidak valid atau pengguna tidak ditemukan.</div>; }


  // --- Render Tampilan Utama Dashboard ---
  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-md">

         {/* Header */}
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4 gap-4">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dasbor Absensi</h1>
                <p className="text-gray-600 mt-1">
                    Selamat datang, <span className="font-semibold">{session.user.name || session.user.email}!</span>
                    <span className="text-sm text-gray-500 ml-2">(Role: {session.user.role})</span>
                </p>
                {session.user.role === Role.SUPER_ADMIN && (
                    <div className="mt-3">
                        <Link href="/admin/users" className="inline-block px-4 py-2 bg-indigo-100 text-indigo-700 text-sm font-medium rounded-md hover:bg-indigo-200 transition-colors">
                            ⚙️ Kelola Pengguna (Admin)
                        </Link>
                    </div>
                )}
            </div>
            <SignOutButton />
         </div>

        {/* Widget Absensi */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg shadow-inner mb-8">
          <h2 className="text-lg font-semibold mb-4 text-center">Absensi Hari Ini</h2>
          {/* Tampilkan widget jika loading status selesai DAN data ada */}
          {isLoadingStatus ? (
             <p className="text-center text-gray-500 italic">Memuat status absensi...</p>
          ) : errorStatus ? (
             <p className="text-center text-red-500">{errorStatus}</p>
          ) : attendanceInfoHariIni ? (
              <AttendanceWidget
                  // Kirim props yang dibutuhkan widget
                  initialDbStatus={attendanceInfoHariIni.status ?? 'BELUM'}
                  initialClockInTime={attendanceInfoHariIni.clockOut ? null : attendanceInfoHariIni.clockIn}
              />
          ) : (
               <p className="text-center text-gray-500 italic">Tidak dapat memuat status absensi.</p> // Fallback
          )}
        </div>

        {/* Filter Rekap */}
        <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Pilih Periode Rekap</h2>
            <FilterRekap currentYear={selectedYear} currentMonth={selectedMonth} />
        </div>

        {/* Bagian Rekap Absensi Bulanan */}
        <div className="mt-2">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Rekap Absensi Bulan: {getNamaBulan(selectedMonth, selectedYear)}</h2>
          {/* Tampilan Loading Rekap */}
          {isLoadingRekap && ( <p className="text-gray-500 text-center py-4 italic">Memuat data rekap...</p> )}
          {/* Tampilan Error Rekap */}
          {!isLoadingRekap && errorRekap && ( <p className="text-red-600 bg-red-100 p-3 rounded mb-4">{errorRekap}</p> )}
          {/* Tampilan Data Rekap Jika Sukses & Ada Data */}
          {!isLoadingRekap && !errorRekap && rekapBulanIni && (
            <>
              {/* Ringkasan Statistik */}
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-center">
                    <div className="p-4 bg-green-100 rounded-lg"><div className="text-sm font-medium text-green-800">Hadir</div><div className="text-2xl font-bold text-green-900">{rekapBulanIni.totalHadir}</div></div>
                    <div className="p-4 bg-yellow-100 rounded-lg"><div className="text-sm font-medium text-yellow-800">Terlambat</div><div className="text-2xl font-bold text-yellow-900">{rekapBulanIni.totalTerlambat}</div></div>
                    <div className="p-4 bg-red-100 rounded-lg"><div className="text-sm font-medium text-red-800">Alpha</div><div className="text-2xl font-bold text-red-900">{rekapBulanIni.totalAlpha}</div></div>
                    <div className="p-4 bg-gray-100 rounded-lg"><div className="text-sm font-medium text-gray-800">Hari Kerja</div><div className="text-2xl font-bold text-gray-900">{rekapBulanIni.totalHariKerja}</div></div>
               </div>
              {/* Detail Harian */}
              <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Detail Harian</h3>
                  <button onClick={() => setIsDetailVisible(!isDetailVisible)} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline mb-3 px-3 py-1 bg-indigo-50 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {isDetailVisible ? 'Sembunyikan Detail' : 'Tampilkan Detail'}
                  </button>
                  {/* Tabel Detail */}
                  {isDetailVisible && (
                      <div className="overflow-x-auto border rounded-md">
                          <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                  <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Masuk</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pulang</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lokasi Masuk</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lokasi Pulang</th>
                                  </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                  {/* Cek jika detail kosong */}
                                  {rekapBulanIni.detailPerHari.length === 0 ? (
                                      <tr><td colSpan={6} className="text-center text-gray-500 py-4">Tidak ada data absensi detail untuk periode ini.</td></tr>
                                  ) : (
                                      rekapBulanIni.detailPerHari.map((detail) => (
                                          <tr key={detail.tanggal.toISOString()} className={'hover:bg-gray-50'}>
                                              {/* Kolom Data Biasa */}
                                               <td className="px-4 py-2 whitespace-nowrap text-sm">{detail.tanggal.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                               <td className="px-4 py-2 whitespace-nowrap text-sm font-medium"><span className={`inline-block px-2 py-0.5 text-xs leading-5 font-semibold rounded-full ${ detail.status === 'HADIR' ? 'bg-green-100 text-green-800': detail.status === 'TERLAMBAT' ? 'bg-yellow-100 text-yellow-800' : detail.status === 'ALPHA' ? 'bg-red-100 text-red-800' : detail.status === 'BELUM' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600' }`}>{detail.status}</span></td>
                                               <td className="px-4 py-2 whitespace-nowrap text-sm">{detail.clockIn ? detail.clockIn.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}</td>
                                               <td className="px-4 py-2 whitespace-nowrap text-sm">{detail.clockOut ? detail.clockOut.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}</td>
                                              {/* Kolom Peta Masuk */}
                                              <td className="px-4 py-2 whitespace-nowrap text-sm align-top">
                                                {(detail.latitudeIn && detail.longitudeIn) ? (
                                                    <div className="w-32 h-20 md:w-40 md:h-24">
                                                        <MapDisplay latitude={detail.latitudeIn} longitude={detail.longitudeIn} popupText={`Masuk: ${detail.clockIn?.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) ?? '-'}`} mapHeight="100%" zoomLevel={15} />
                                                    </div>
                                                ) : ( <span className="text-xs text-gray-400 italic">N/A</span> )}
                                              </td>
                                              {/* Kolom Peta Pulang */}
                                               <td className="px-4 py-2 whitespace-nowrap text-sm align-top">
                                                {(detail.latitudeOut && detail.longitudeOut) ? (
                                                    <div className="w-32 h-20 md:w-40 md:h-24">
                                                        <MapDisplay latitude={detail.latitudeOut} longitude={detail.longitudeOut} popupText={`Pulang: ${detail.clockOut?.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) ?? '-'}`} mapHeight="100%" zoomLevel={15} />
                                                    </div>
                                                ) : ( <span className="text-xs text-gray-400 italic">N/A</span> )}
                                               </td>
                                          </tr>
                                      ))
                                  )}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>
              {/* Akhir Detail Harian */}
            </>
          )}
          {/* Fallback jika data rekap kosong */}
          {!isLoadingRekap && !errorRekap && !rekapBulanIni && ( <p className="text-gray-500 text-center py-4 italic">Tidak ada data rekap untuk ditampilkan.</p> )}
        </div>
        {/* --- AKHIR BAGIAN REKAP --- */}

      </div>
    </div>
  );
}