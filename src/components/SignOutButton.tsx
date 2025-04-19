// src/components/SignOutButton.tsx
'use client'; // Komponen ini butuh interaksi klik di browser

import { signOut } from 'next-auth/react'; // Import fungsi signOut dari NextAuth

// PASTIKAN ADA 'export default' di sini
export default function SignOutButton() {
  // Fungsi yang dijalankan saat tombol diklik
  const handleSignOut = () => {
    // Panggil signOut, lalu arahkan ke halaman login setelah berhasil logout
    signOut({ callbackUrl: '/login' });
  };

  // Tampilan tombol logout
  return (
    <button
      onClick={handleSignOut} // Jalankan handleSignOut saat diklik
      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 text-sm font-medium whitespace-nowrap"
    >
      Keluar
    </button>
  );
}