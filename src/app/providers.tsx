// src/app/providers.tsx

// Baris ini PENTING! Komponen ini harus berjalan di sisi klien (browser)
// karena SessionProvider mengelola state sesi yang berubah-ubah.
'use client';

// Import SessionProvider dari library next-auth/react
import { SessionProvider } from 'next-auth/react';
import React from 'react'; // Import React (biasanya otomatis, tapi lebih baik eksplisit)

// Definisikan tipe untuk props (properti) yang diterima komponen ini
interface ProvidersProps {
  children: React.ReactNode; // children adalah komponen lain yang akan dibungkus
}

// Definisikan komponen React bernama Providers
export default function Providers({ children }: ProvidersProps) {
  // Komponen ini hanya me-render SessionProvider
  // dan menempatkan semua 'children' (konten aplikasi lainnya) di dalamnya.
  // Dengan begini, semua 'children' bisa mengakses konteks sesi dari SessionProvider.
  return <SessionProvider>{children}</SessionProvider>;
}