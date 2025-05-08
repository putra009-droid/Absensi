// src/app/layout.tsx
import '@/app/globals.css'; // Pastikan impor ini benar menggunakan alias @
import type { Metadata } from 'next';
import { ReactNode } from 'react';

// Metadata dasar (sesuaikan jika perlu)
export const metadata: Metadata = {
  title: 'Aplikasi Absensi',
  description: 'Aplikasi Absensi Karyawan Modern',
};

// Komponen RootLayout
export default function RootLayout({
  children,
}: {
  children: ReactNode; // children adalah tipe ReactNode
}) {
  return (
    <html lang="id"> {/* Set bahasa ke Indonesia */}
      <body>
        {/* Konten halaman Anda akan dirender di sini */}
        {children}
      </body>
    </html>
  );
}