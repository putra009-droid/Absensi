// Lokasi File: src/app/admin/users/edit/[userId]/_components/EditUserForm.tsx
'use client';

import { useState, useEffect } from 'react'; // Import useEffect
import { useRouter } from 'next/navigation';
import { Role, User } from '@prisma/client';
import { useSession } from 'next-auth/react'; // Untuk cek sesi jika perlu disable role
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
  const { data: session, status: sessionStatus } = useSession();

  // State untuk setiap field form
  const [name, setName] = useState(userData.name || '');
  const [selectedRole, setSelectedRole] = useState<Role>(userData.role);
  const [baseSalary, setBaseSalary] = useState<string>(''); // Inisialisasi awal KOSONG
  const [isLoading, setIsLoading] = useState(false);

  // Efek untuk sinkronisasi state baseSalary dengan prop jika prop berubah
  useEffect(() => {
    // Set state baseSalary ketika userData.baseSalary berubah (dan tidak undefined)
    // Ini menangani kasus jika userData dimuat/berubah setelah render awal
    if (userData.baseSalary !== undefined) {
      setBaseSalary(userData.baseSalary || ''); // Set ke nilai prop atau "" jika null/undefined
    }
  }, [userData.baseSalary]); // Dijalankan jika prop baseSalary berubah

  // Filter role yang bisa dipilih
  const availableRoles = Object.values(Role).filter(role => role !== Role.SUPER_ADMIN);

  // Handler untuk submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Siapkan data untuk dikirim ke API
    const updateData = {
      name: name.trim(),
      role: selectedRole,
      baseSalary: baseSalary.trim() === '' ? null : baseSalary.trim(), // Kirim null jika kosong
    };

    // Validasi sisi klien
    if (!updateData.name) { toast.error('Nama tidak boleh kosong.'); setIsLoading(false); return; }
    if (updateData.baseSalary !== null && isNaN(Number(updateData.baseSalary))) { toast.error('Gaji Pokok harus berupa angka.'); setIsLoading(false); return; }

    try {
      // Panggil API PUT ke endpoint yang benar
      const res = await fetch(`/api/admin/users/${userData.id}`, { // Target: /api/admin/users/[userId]
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }, // Tidak perlu header Authorization
        body: JSON.stringify(updateData),
      });

      // Tangani respons error dari server
      if (!res.ok) {
        let errorData = { message: `Gagal memperbarui pengguna (Status: ${res.status})`};
        try { errorData = await res.json(); } catch (parseError) { console.error("Could not parse error response body:", parseError); }
        throw new Error(errorData.message);
      }

      // Tangani respons sukses
      const data = await res.json();
      toast.success(data.message || 'Data pengguna berhasil diperbarui!');

      // Redirect setelah sukses
      setTimeout(() => {
        router.push('/admin/users');
        router.refresh();
      }, 1500);

    } catch (error: any) {
      // Tangani error fetch atau error yang dilempar dari blok try
      console.error("[EDIT_USER_ERROR]", error);
      toast.error(error.message || 'Terjadi kesalahan saat menyimpan.');
    } finally {
      // Selalu hentikan loading
      setIsLoading(false);
    }
  };

  // Tampilkan loading jika sesi belum siap
  if (sessionStatus === 'loading') {
    return <p className='text-center text-gray-500 italic'>Memeriksa sesi...</p>;
  }

  // Render Form
  return (
    <div> {/* Wrapper div */}
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
            type="number" // Gunakan tipe number
            step="0.01"
            min="0"
            value={baseSalary} // Tampilkan state baseSalary
            onChange={(e) => setBaseSalary(e.target.value)} // Update state baseSalary
            placeholder="Kosongkan jika tidak ada"
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border disabled:bg-gray-100"
            autoComplete="off" // Matikan autocomplete untuk gaji
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
            disabled={isLoading || (userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN)} // Disable jika edit diri sendiri & Super Admin
            className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border ${(isLoading || (userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN)) ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
            autoComplete="off" // Matikan autocomplete untuk role
          >
            {/* Opsi untuk Super Admin (jika user yang diedit adalah SA) */}
            {userData.role === Role.SUPER_ADMIN && ( <option key={userData.role} value={userData.role}>{userData.role} (Tidak bisa diubah)</option> )}
            {/* Opsi untuk role lain */}
            {availableRoles.map((role) => ( <option key={role} value={role}>{role}</option> ))}
          </select>
          {/* Pesan jika role Super Admin di-disable */}
          {userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN && ( <p className="mt-1 text-xs text-gray-500">Anda tidak dapat mengubah role Super Admin Anda sendiri.</p> )}
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