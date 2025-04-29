// Lokasi File: src/app/admin/users/edit/[userId]/_components/EditUserForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Role, User } from '@prisma/client';
// PENTING: Anda mengimpor useSession dari NextAuth, tapi backend Anda pakai JWT kustom.
// Ini bisa menyebabkan masalah jika sesi NextAuth tidak sinkron/tidak digunakan.
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { toast } from 'sonner'; // Asumsi menggunakan sonner

interface EditUserFormProps {
  // Menerima data user awal dari parent page
  userData: Pick<User, 'id' | 'name' | 'email' | 'role'> & {
    baseSalary?: string | null // baseSalary diterima sebagai string atau null
  };
}

export default function EditUserForm({ userData }: EditUserFormProps) {
  const router = useRouter();
  // PENTING: `session` di sini berasal dari NextAuth, mungkin tidak berisi data user dari JWT kustom Anda.
  const { data: session, status: sessionStatus } = useSession();

  // State untuk setiap field form
  const [name, setName] = useState(userData.name || '');
  const [selectedRole, setSelectedRole] = useState<Role>(userData.role);
  const [baseSalary, setBaseSalary] = useState<string>(''); // Inisialisasi awal KOSONG
  const [isLoading, setIsLoading] = useState(false);

  // Efek untuk sinkronisasi state baseSalary dengan prop jika prop berubah
  useEffect(() => {
    if (userData.baseSalary !== undefined) {
      setBaseSalary(userData.baseSalary || '');
    }
  }, [userData.baseSalary]);

  // Filter role yang bisa dipilih
  const availableRoles = Object.values(Role).filter(role => role !== Role.SUPER_ADMIN);

  // Handler untuk submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const updateData = {
      name: name.trim(),
      role: selectedRole,
      baseSalary: baseSalary.trim() === '' ? null : baseSalary.trim(),
    };

    if (!updateData.name) { toast.error('Nama tidak boleh kosong.'); setIsLoading(false); return; }
    if (updateData.baseSalary !== null && isNaN(Number(updateData.baseSalary))) { toast.error('Gaji Pokok harus berupa angka.'); setIsLoading(false); return; }

    try {
      // PENTING: Panggilan fetch ini perlu ditambahkan header Authorization
      // dengan token JWT kustom Anda agar bisa lolos middleware `withAuth` di backend.
      // Contoh: headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenDariKonteksAuth}` }
      const res = await fetch(`/api/admin/users/${userData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }, // <-- Tambahkan header Authorization di sini!
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        let errorData = { message: `Gagal memperbarui pengguna (Status: ${res.status})`};
        try { errorData = await res.json(); } catch (parseError) { console.error("Could not parse error response body:", parseError); }
        throw new Error(errorData.message);
      }

      const data = await res.json();
      toast.success(data.message || 'Data pengguna berhasil diperbarui!');

      setTimeout(() => {
        router.push('/admin/users');
        router.refresh();
      }, 1500);

    } catch (error: any) {
      console.error("[EDIT_USER_ERROR]", error);
      toast.error(error.message || 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setIsLoading(false);
    }
  };

  // Tampilkan loading jika sesi NextAuth belum siap (jika Anda tetap menggunakan useSession)
  if (sessionStatus === 'loading') {
    return <p className='text-center text-gray-500 italic'>Memeriksa sesi...</p>;
  }

  // Render Form
  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Input Nama */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nama Lengkap</label>
          <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border disabled:bg-gray-100" autoComplete="name"/>
        </div>

        {/* Input Email (Read Only) */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
          <input id="email" type="email" readOnly value={userData.email} className="mt-1 block w-full rounded-md bg-gray-100 border-gray-300 shadow-sm p-2 border cursor-not-allowed" autoComplete="email"/>
        </div>

        {/* Input Gaji Pokok */}
        <div>
          <label htmlFor="baseSalary" className="block text-sm font-medium text-gray-700">Gaji Pokok (Rp)</label>
          <input
            id="baseSalary"
            type="number"
            step="0.01"
            min="0"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            placeholder="Kosongkan jika tidak ada"
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border disabled:bg-gray-100"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-gray-500">Masukkan angka saja. Gunakan titik (.) untuk desimal jika perlu.</p>
        </div>

        {/* Input Role (Select) */}
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700">Role</label>
          <select
            id="role"
            required
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
            // == PERBAIKAN 1: Logika disabled ==
            disabled={isLoading || (userData.role === Role.SUPER_ADMIN)}
            className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border ${
              (isLoading || (userData.role === Role.SUPER_ADMIN))
              ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
            }`}
            autoComplete="off"
          >
            {/* Opsi untuk Super Admin (jika user yang diedit adalah SA) */}
            {userData.role === Role.SUPER_ADMIN && ( <option key={userData.role} value={userData.role}>{userData.role} (Tidak bisa diubah)</option> )}
            {/* Opsi untuk role lain */}
            {availableRoles.map((role) => ( <option key={role} value={role}>{role}</option> ))}
          </select>
          {/* == PERBAIKAN 2: Menghapus elemen <p> kondisional di bawah ini == */}
          {/* Baris yang menyebabkan error kedua sebelumnya telah dihapus */}
        </div>

        {/* Tombol Submit dan Link Kembali */}
        <div className="pt-4 space-y-3">
          <button type="submit" disabled={isLoading} className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${ isLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500' }`}>
            {isLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          <div className="text-center">
            <Link href="/admin/users" className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline">
              ← Batal dan Kembali ke Daftar Pengguna
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}