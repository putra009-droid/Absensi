// src/app/layout.tsx
import './globals.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

// Metadata bisa tetap di sini atau dipindahkan ke dalam <head> jika perlu
export const metadata: Metadata = {
  title: 'Aplikasi Absensi',
  description: 'Absensi Karyawan Modern',
  // Tambahkan viewport di sini jika Metadata mendukungnya,
  // atau tambahkan tag <meta> secara manual di bawah
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      {/* Tambahkan <head> secara manual jika perlu */}
      <head>
        {/* --- TAMBAHKAN BARIS INI --- */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* ------------------------- */}
        {/* Favicon, dll bisa ditambahkan di sini juga */}
      </head>
      <body className={`${inter.className} bg-gray-100`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}