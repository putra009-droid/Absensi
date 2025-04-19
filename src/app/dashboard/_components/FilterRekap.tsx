// src/app/dashboard/_components/FilterRekap.tsx
'use client'; // Komponen ini interaktif di browser

import { useRouter, usePathname, useSearchParams } from 'next/navigation'; // Hook untuk navigasi & URL
import { useState, useMemo, useCallback } from 'react'; // Hook React

// Props yang diterima dari halaman dashboard
interface FilterRekapProps {
  currentYear: number;  // Tahun yang sedang aktif ditampilkan
  currentMonth: number; // Bulan yang sedang aktif ditampilkan (0-11)
}

// Komponen untuk menampilkan dropdown filter bulan dan tahun
export default function FilterRekap({ currentYear, currentMonth }: FilterRekapProps) {
  const router = useRouter(); // Hook untuk melakukan navigasi/refresh
  const pathname = usePathname(); // Mendapatkan path URL saat ini (misal: '/dashboard')
  const searchParams = useSearchParams(); // Untuk membaca parameter URL lain (jika ada)

  // State lokal untuk menyimpan nilai dropdown yang dipilih pengguna
  // Diinisialisasi dengan nilai dari props (tahun/bulan aktif)
  const [year, setYear] = useState<string>(currentYear.toString());
  const [month, setMonth] = useState<string>(currentMonth.toString());

  // Membuat daftar pilihan tahun (misal: 5 tahun ke belakang + tahun ini)
  // useMemo agar daftar ini tidak dibuat ulang setiap kali render
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const options = [];
    for (let y = current; y >= current - 5; y--) {
      options.push(y);
    }
    return options;
  }, []);

  // Daftar pilihan bulan (statis)
  const monthOptions = [
    { value: '0', label: 'Januari' }, { value: '1', label: 'Februari' },
    { value: '2', label: 'Maret' }, { value: '3', label: 'April' },
    { value: '4', label: 'Mei' }, { value: '5', label: 'Juni' },
    { value: '6', label: 'Juli' }, { value: '7', label: 'Agustus' },
    { value: '8', label: 'September' }, { value: '9', label: 'Oktober' },
    { value: '10', label: 'November' }, { value: '11', label: 'Desember' },
  ];

  // Fungsi yang dipanggil saat tombol "Tampilkan Rekap" diklik
  // useCallback agar fungsi ini tidak dibuat ulang kecuali dependensinya berubah
  const handleFilterChange = useCallback(() => {
    // Buat object URLSearchParams dari parameter URL yang ada saat ini (untuk jaga parameter lain jika ada)
    const params = new URLSearchParams(searchParams.toString());
    // Set/update parameter 'tahun' dan 'bulan' dengan nilai dari state dropdown
    params.set('tahun', year);
    params.set('bulan', month);

    // --- PEMBUATAN URL BARU (BAGIAN PENTING) ---
    // Gunakan backticks (`) untuk template literal JavaScript.
    // Ini menggabungkan nilai variabel pathname (misal: '/dashboard') dengan tanda tanya '?'
    // dan string parameter yang sudah dibuat (misal: 'tahun=2024&bulan=3').
    const newUrl = `${pathname}?${params.toString()}`;
    // --- AKHIR PEMBUATAN URL ---

    // (Opsional) Log untuk melihat URL yang akan dituju di console browser (F12)
    console.log('Akan navigasi ke:', newUrl);

    // Gunakan router.push untuk navigasi ke URL baru.
    // Ini akan memicu Next.js App Router untuk me-render ulang halaman
    // Server Component (DashboardPage) dengan searchParams yang baru.
    router.push(newUrl);

  }, [year, month, pathname, router, searchParams]); // Dependensi useCallback

  // Tampilan JSX untuk filter
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-end p-4 border rounded-md bg-gray-50">
      {/* Dropdown Pilih Tahun */}
      <div>
        <label htmlFor="filter-tahun" className="block text-sm font-medium text-gray-700 mb-1">
          Tahun
        </label>
        <select
          id="filter-tahun"
          value={year} // Nilai terpilih dikontrol state 'year'
          onChange={(e) => setYear(e.target.value)} // Update state 'year' saat berubah
          className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Dropdown Pilih Bulan */}
      <div>
        <label htmlFor="filter-bulan" className="block text-sm font-medium text-gray-700 mb-1">
          Bulan
        </label>
        <select
          id="filter-bulan"
          value={month} // Nilai terpilih dikontrol state 'month'
          onChange={(e) => setMonth(e.target.value)} // Update state 'month' saat berubah
          className="block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
        >
          {monthOptions.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Tombol untuk Terapkan Filter */}
      <button
        onClick={handleFilterChange} // Jalankan fungsi handleFilterChange saat diklik
        className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Tampilkan Rekap
      </button>
    </div>
  );
}