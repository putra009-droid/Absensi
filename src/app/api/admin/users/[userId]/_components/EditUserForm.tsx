'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role, User } from '@prisma/client';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { toast } from 'sonner';

interface EditUserFormProps {
  userData: Pick<User, 'id' | 'name' | 'email' | 'role'> & { 
    baseSalary?: string | null 
  };
}

export default function EditUserForm({ userData }: EditUserFormProps) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [name, setName] = useState(userData.name || '');
  const [selectedRole, setSelectedRole] = useState<Role>(userData.role);
  const [baseSalary, setBaseSalary] = useState<string>(userData.baseSalary || '');
  const [isLoading, setIsLoading] = useState(false);

  const availableRoles = Object.values(Role).filter(role => role !== Role.SUPER_ADMIN);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const updateData = {
      id: userData.id,
      name: name.trim(),
      role: selectedRole,
      baseSalary: baseSalary.trim() === '' ? null : baseSalary.trim(),
    };

    // Validasi
    if (!updateData.name) {
      toast.error('Nama tidak boleh kosong.');
      setIsLoading(false);
      return;
    }

    if (updateData.baseSalary !== null && isNaN(Number(updateData.baseSalary))) {
      toast.error('Gaji Pokok harus berupa angka.');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.accessToken}` 
        },
        body: JSON.stringify(updateData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal memperbarui pengguna');
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

  if (sessionStatus === 'loading') {
    return <p className='text-center text-gray-500 italic'>Memeriksa sesi...</p>;
  }

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md">
      <h1 className="text-xl font-bold mb-6">Edit Data Pengguna</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Nama Lengkap
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            readOnly
            value={userData.email}
            className="mt-1 block w-full rounded-md bg-gray-100 border-gray-300 shadow-sm p-2 border cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="baseSalary" className="block text-sm font-medium text-gray-700">
            Gaji Pokok (Rp)
          </label>
          <input
            id="baseSalary"
            type="number"
            step="0.01"
            min="0"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            placeholder="Kosongkan jika tidak diisi"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
          />
          <p className="mt-1 text-xs text-gray-500">
            Masukkan angka saja. Gunakan titik (.) untuk desimal jika perlu.
          </p>
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-700">
            Role
          </label>
          <select
            id="role"
            required
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
            disabled={userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN}
            className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border ${
              userData.id === session?.user?.id && userData.role === Role.SUPER_ADMIN 
                ? 'bg-gray-100 cursor-not-allowed' 
                : 'bg-white'
            }`}
          >
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              isLoading
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
            {isLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>

        <div className="text-center pt-2">
          <Link
            href="/admin/users"
            className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            ← Kembali ke Daftar Pengguna
          </Link>
        </div>
      </form>
    </div>
  );
}