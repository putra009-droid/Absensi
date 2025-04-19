// src/app/login/page.tsx
'use client'; // Komponen ini perlu interaksi di browser

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react'; // Import signIn dan useSession
import { useRouter, useSearchParams } from 'next/navigation'; // Import hook navigasi
import Link from 'next/link'; // Import Link

// Komponen Halaman Login
export default function LoginPage() {
  // State untuk input form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // State untuk error, loading, dan pesan sukses dari registrasi
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter(); // Hook untuk navigasi
  const { status } = useSession(); // Hook untuk cek status sesi login
  const searchParams = useSearchParams(); // Hook untuk baca parameter URL

  // useEffect untuk menangani redirect jika sudah login atau ada pesan dari register
  useEffect(() => {
    // Cek parameter URL '?registered=true'
    if (searchParams?.get('registered') === 'true') {
      setSuccessMessage('Registrasi berhasil! Silakan masuk.');
      router.replace('/login', undefined); // Hapus parameter dari URL
    }
    // Jika status sesi adalah 'authenticated' (sudah login)
    if (status === 'authenticated') {
      router.push('/dashboard'); // Langsung arahkan ke dashboard
    }
    // Bergantung pada status, router, dan searchParams
  }, [status, router, searchParams]);

  // Fungsi submit form login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSuccessMessage(null); setIsLoading(true);
    try {
      // Panggil fungsi signIn dari NextAuth
      const result = await signIn('credentials', {
        redirect: false, // Jangan redirect otomatis, kita handle manual
        email,
        password,
      });

      if (result?.error) { // Jika ada error dari NextAuth (misal: password salah)
        setError('Email atau password salah.');
      } else if (result?.ok) { // Jika login berhasil
        router.push('/dashboard'); // Arahkan ke dashboard
      } else {
         setError('Login gagal. Coba lagi.'); // Kasus lain
      }
    } catch (err) { // Tangkap error jaringan dll.
       console.error("Login error:", err);
       setError('Terjadi kesalahan. Coba lagi nanti.');
    } finally {
      setIsLoading(false); // Hentikan loading
    }
  };

  // Tampilkan loading jika status sesi masih dicek
  if (status === 'loading') return <div className="flex items-center justify-center min-h-screen">Memuat...</div>;
  // Jangan tampilkan form jika sudah login
  if (status === 'authenticated') return null;

  // Tampilan JSX Halaman Login
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-xl">
        <h2 className="text-3xl font-bold text-center text-gray-800">Masuk ke Akun</h2>
        {/* Tampilkan pesan sukses atau error */}
        {successMessage && <p className="text-sm text-center text-green-600 p-2 bg-green-100 rounded-md">{successMessage}</p>}
        {error && <p className="text-sm text-center text-red-600 p-2 bg-red-100 rounded-md">{error}</p>}
        {/* Form Login */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Alamat Email</label>
            <input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="email@contoh.com"/>
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Password Anda"/>
          </div>
          <div>
            <button type="submit" disabled={isLoading} className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200 ${isLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {isLoading ? 'Memproses...' : 'Masuk'}
            </button>
          </div>
        </form>
       
      </div>
    </div>
  );
}