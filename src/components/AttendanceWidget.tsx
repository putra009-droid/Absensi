// Lokasi File: src/components/AttendanceWidget.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
// Import Enum Status jika perlu tipe kuat, atau gunakan string literal saja
import { AttendanceStatus } from '@prisma/client';
import Link from 'next/link'; // Pastikan Link diimport jika dipakai

// Tipe status internal widget
type WidgetDisplayStatus = AttendanceStatus | 'BELUM' | 'LIBUR' | 'LOADING' | 'ERROR_LOC' | 'ERROR_API';

// Props dari Parent (DashboardPage)
interface AttendanceWidgetProps {
  initialDbStatus: AttendanceStatus | 'BELUM' | 'LIBUR'; // Status dari getStatusHarian
  initialClockInTime: Date | null; // Waktu clock-in jika status HADIR/TERLAMBAT
}

export default function AttendanceWidget({
  initialDbStatus,
  initialClockInTime
}: AttendanceWidgetProps) {

  const router = useRouter();

  // State internal widget
  const [displayStatus, setDisplayStatus] = useState<WidgetDisplayStatus>(initialDbStatus);
  const [isLoading, setIsLoading] = useState(false); // Loading untuk proses aksi
  const [lastClockInTime, setLastClockInTime] = useState<Date | null>(initialClockInTime);
  const [formattedClockInTime, setFormattedClockInTime] = useState<string | null>(null);

  // Update state internal jika props berubah
  useEffect(() => {
      setDisplayStatus(initialDbStatus);
      setLastClockInTime(initialClockInTime);
  }, [initialDbStatus, initialClockInTime]);

  // Format waktu
  useEffect(() => {
    if (lastClockInTime) {
      setFormattedClockInTime(lastClockInTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
    } else {
      setFormattedClockInTime(null);
    }
  }, [lastClockInTime]);

  // Fungsi ambil lokasi
  const getCurrentLocation = (): Promise<{latitude: number, longitude: number}> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Browser tidak mendukung geolokasi')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => {
          let message = 'Gagal mendapatkan lokasi: ';
          switch(err.code) {
             case err.PERMISSION_DENIED: message += 'Izin ditolak'; break;
             case err.POSITION_UNAVAILABLE: message += 'Lokasi tidak tersedia'; break;
             case err.TIMEOUT: message += 'Waktu permintaan habis'; break;
             default: message += 'Error tidak diketahui';
          }
          reject(new Error(message));
         }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  // Fungsi handle aksi
  const handleAction = async (type: 'in' | 'out') => {
    // Cek state saat ini sebelum memulai aksi
     if (type === 'in' && (displayStatus === 'HADIR' || displayStatus === 'TERLAMBAT')) {
          toast.error('Anda sudah dalam status Clock In/Terlambat hari ini.');
          return;
     }
      if (type === 'out' && displayStatus !== 'HADIR' && displayStatus !== 'TERLAMBAT') {
          toast.error('Anda belum Clock In atau sudah Clock Out/Selesai.');
          return;
      }

    setIsLoading(true);
    try {
      const { latitude, longitude } = await getCurrentLocation();
      const apiUrl = `/api/attendance/clock-${type}`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude })
      });

      const data = await res.json();
      console.log(`API Clock ${type.toUpperCase()} Response:`, res.status, data);

      if (!res.ok) { throw new Error(data.message || `Gagal melakukan Clock ${type}`); }

      // Update State UI jika SUKSES berdasarkan respons API
      if (type === 'in' && data.success && data.data?.status && data.data?.clockIn) {
        const clockInTime = new Date(data.data.clockIn);
        // Update status sesuai response API (HADIR/TERLAMBAT)
        setDisplayStatus(data.data.status as AttendanceStatus);
        setLastClockInTime(clockInTime);
        toast.success(data.message || 'Clock In berhasil!');
      } else if (type === 'out' && data.success && data.data?.status) {
        setDisplayStatus(data.data.status as AttendanceStatus); // Harusnya SELESAI
        setLastClockInTime(null);
        setFormattedClockInTime(null);
        toast.success(data.message || 'Clock Out berhasil!');
      } else {
         // Jika response success tapi format data tidak sesuai
         throw new Error(`Format respons API Clock ${type} tidak sesuai.`);
      }
      router.refresh(); // Tetap refresh

    } catch (error: any) {
      console.error(`[CLOCK_${type.toUpperCase()}_ERROR]`, error);
      toast.error(error.message || 'Terjadi kesalahan');
      // Set state error jika perlu untuk UI tambahan (opsional)
      // setDisplayStatus('ERROR_API');
    } finally {
      setIsLoading(false);
    }
  };

  // Render JSX
  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <h3 className="font-semibold text-lg mb-3 text-center">Absensi Hari Ini</h3>

      {/* Kondisi berdasarkan displayStatus */}
      {displayStatus === 'HADIR' || displayStatus === 'TERLAMBAT' ? (
        // --- TAMPILAN SAAT SUDAH CLOCKED IN (HADIR/TERLAMBAT) ---
        <div className="space-y-2 text-center">
          <p className={`${displayStatus === 'TERLAMBAT' ? 'text-orange-600' : 'text-green-600'} mb-2`}>
            Status: {displayStatus} <br/>
            Clock In: {formattedClockInTime || 'Memuat...'}
          </p>
          <button
            onClick={() => handleAction('out')}
            disabled={isLoading}
            className={`w-full py-2 rounded-md text-white transition-colors ${isLoading ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
          >
            {isLoading ? 'Memproses...' : 'Clock Out'}
          </button>
        </div>
      ) : (
        // --- TAMPILAN SAAT BELUM CLOCK IN ATAU STATUS LAIN ---
        <div className="space-y-2 text-center">
          <p className="text-gray-600 mb-2">
            {/* Tampilkan pesan sesuai status */}
            {displayStatus === 'SELESAI' ? 'Anda Sudah Clock Out Hari Ini' :
             displayStatus === 'BELUM' ? 'Silakan Lakukan Clock In' :
             displayStatus === 'LIBUR' ? 'Hari Ini Libur' :
             displayStatus === 'ALPHA' ? 'Status: Alpha' : // Status lain dari DB
             displayStatus === 'IZIN' ? 'Status: Izin' :
             displayStatus === 'SAKIT' ? 'Status: Sakit' :
             displayStatus === 'CUTI' ? 'Status: Cuti' :
             'Memuat Status...' // Default atau Loading
            }
          </p>
          <button
            onClick={() => handleAction('in')}
            // Nonaktifkan jika sedang loading ATAU jika status BUKAN 'BELUM' atau 'ALPHA' (atau status lain yg boleh clock in)
            disabled={isLoading || !(displayStatus === 'BELUM' || displayStatus === 'ALPHA')}
            className={`w-full py-2 text-white rounded-md transition-colors ${
              isLoading || !(displayStatus === 'BELUM' || displayStatus === 'ALPHA')
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isLoading ? 'Memproses...' : 'Clock In'}
          </button>
        </div>
      )}
    </div>
  );
}