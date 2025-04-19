// src/app/layout.tsx
import './globals.css';
import 'leaflet/dist/leaflet.css'; // <-- PASTIKAN IMPORT INI ADA
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aplikasi Absensi',
  description: 'Absensi Karyawan Modern',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-gray-100`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}