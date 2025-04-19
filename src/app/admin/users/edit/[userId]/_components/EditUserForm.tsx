// Lokasi File: src/app/admin/users/edit/[userId]/_components/EditUserForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role, User } from '@prisma/client';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface EditUserFormProps {
  userData: Pick<User, 'id' | 'name' | 'email' | 'role'>;
}

export default function EditUserForm({ userData }: EditUserFormProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [name, setName] = useState(userData.name || '');
  const [selectedRole, setSelectedRole] = useState<Role>(userData.role);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const availableRoles = Object.values(Role).filter(role => role !== Role.SUPER_ADMIN);

  // Handler submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage(null); setIsLoading(true);

    // --- PERUBAHAN DISINI ---
    // Sertakan ID di dalam data body
    const updateData = {
      id: userData.id, // <-- Kirim ID user yang diedit
      name: name.trim(),
      role: selectedRole,
    };
    // --- AKHIR PERUBAHAN ---

    // Validasi nama
    if (!updateData.name) {
        setMessage({ type: 'error', text: 'Nama tidak boleh kosong.' });
        setIsLoading(false);
        return;
    }

    try {
      // --- PERUBAHAN DISINI ---
      // Panggil API PUT ke '/api/admin/users' (TANPA ID di URL)
      const res = await fetch(`/api/admin/users`, {
      // --- AKHIR PERUBAHAN ---
        method: 'PUT', // Method tetap PUT
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData), // Kirim data (termasuk ID) di body
      });

      const data = await res.json();
      if (!res.ok) { throw new Error(data.message || 'Gagal menyimpan perubahan.'); }
      setMessage({ type: 'success', text: data.message || 'Data berhasil diperbarui!' });
      setTimeout(() => { router.push('/admin/users'); router.refresh(); }, 1500);

    } catch (err: any) {
      console.error("Update user error:", err);
      setMessage({ type: 'error', text: err.message });
    } finally { setIsLoading(false); }
  };

  // Handle loading sesi
   if (sessionStatus === 'loading') {
       return <p className='text-center text-gray-500 italic'>Memeriksa sesi...</p>;
   }

  // Render form (JSX tetap sama)
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {message && ( <p className={`text-sm p-3 rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</p> )}
      {/* Input Nama */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
        <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm"/>
      </div>
      {/* Input Email (Read Only) */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email (Tidak Bisa Diubah)</label>
        <input id="email" type="email" readOnly disabled value={userData.email} className="block w-full px-3 py-2 border border-gray-200 rounded-md shadow-sm sm:text-sm bg-gray-100 text-gray-500 cursor-not-allowed"/>
      </div>
      {/* Pilihan Role */}
      <div>
        <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select
          id="role" required value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as Role)}
          disabled={userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN}
          className={`block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm bg-white ${ (userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : '' }`} >
           {availableRoles.map((roleOption) => (<option key={roleOption} value={roleOption}>{roleOption}</option>))}
           {userData.role === Role.SUPER_ADMIN && (<option key={Role.SUPER_ADMIN} value={Role.SUPER_ADMIN} disabled>SUPER_ADMIN (Tidak bisa diubah)</option>)}
        </select>
        {userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN && (<p className="mt-1 text-xs text-gray-500">Super Admin tidak dapat mengubah role diri sendiri.</p>)}
      </div>
      {/* Tombol Simpan */}
      <div className="pt-2">
        <button type="submit" disabled={isLoading} className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isLoading ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
          {isLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>
       {/* Link Kembali */}
       <div className="text-center mt-4">
            <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-800 hover:underline">
                &larr; Kembali ke Daftar Pengguna
            </Link>
       </div>
    </form>
  );
}