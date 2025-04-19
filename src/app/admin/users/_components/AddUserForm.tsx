// Lokasi File: src/app/admin/users/_components/AddUserForm.tsx
'use client'; // Form ini interaktif

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@prisma/client'; // Import Role enum

// Komponen ini TIDAK menerima props 'userData'
export default function AddUserForm() {
  const router = useRouter();

  // --- Inisialisasi State untuk Form Tambah ---
  // State dimulai dengan nilai kosong atau default, BUKAN dari props.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>(Role.EMPLOYEE); // Default role saat menambah
  // --- Akhir Inisialisasi State ---

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter role agar SUPER_ADMIN tidak bisa dipilih saat menambah
  const availableRoles = Object.values(Role).filter(role => role !== Role.SUPER_ADMIN);

  // Fungsi submit untuk MENAMBAH user
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    // Data yang dikirim adalah dari state form saat ini
    const newUserData = { name, email, password, role: selectedRole };

    try {
      // Panggil API untuk MENAMBAH user (method POST ke /api/admin/users)
      const res = await fetch('/api/admin/users', { // Pastikan URL benar (tanpa [userId])
        method: 'POST', // Method POST untuk membuat resource baru
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserData),
      });

      const data = await res.json();
      if (!res.ok) { throw new Error(data.message || 'Gagal menambahkan pengguna.'); }

      // Jika sukses
      setMessage({ type: 'success', text: `Pengguna ${data.user?.name ?? email} berhasil ditambahkan!` });
      // Reset form ke kondisi awal
      setName('');
      setEmail('');
      setPassword('');
      setSelectedRole(Role.EMPLOYEE);
      // Refresh halaman daftar user setelah jeda untuk melihat user baru
      setTimeout(() => { router.refresh(); }, 1500);

    } catch (err: any) {
      console.error("Add user error:", err);
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Render JSX Form Tambah ---
  // Tidak ada perbedaan signifikan di JSX-nya, yang penting state awalnya benar
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
       {message && ( <p className={`text-sm p-3 rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</p> )}
        <div>
            <label htmlFor="add-name" className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <input id="add-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
        </div>
        <div>
            <label htmlFor="add-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="add-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" />
        </div>
        <div>
            <label htmlFor="add-password" className="block text-sm font-medium text-gray-700 mb-1">Password Awal</label>
            <input id="add-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" placeholder="Min. 6 karakter"/>
        </div>
        <div>
            <label htmlFor="add-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select id="add-role" required value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as Role)} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm bg-white">
                {/* Loop role yang tersedia */}
                {availableRoles.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>{roleOption}</option>
                ))}
            </select>
        </div>
        <div>
            <button type="submit" disabled={isLoading} className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {isLoading ? 'Menyimpan...' : 'Tambah Pengguna'}
            </button>
        </div>
    </form>
  );
}