// src/app/admin/allowance-types/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
// Asumsi Anda punya komponen Modal, Button, Input, Table, etc.
// import { Modal, Button, Input, Table, Checkbox, Spinner, Alert } from '@/components/ui'; // Contoh

interface AllowanceType {
    id: string;
    name: string;
    description: string | null;
    isFixed: boolean;
    // createdAt, updatedAt (opsional ditampilkan)
}

export default function ManageAllowanceTypesPage() {
    const { data: session, status } = useSession({ required: true }); // Wajib login

    const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingType, setEditingType] = useState<AllowanceType | null>(null);
    const [formData, setFormData] = useState({ id: '', name: '', description: '', isFixed: true });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fungsi untuk fetch data (dibuat useCallback agar stabil)
    const fetchAllowanceTypes = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/allowance-types');
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || `Gagal mengambil data (${res.status})`);
            }
            const data: AllowanceType[] = await res.json();
            setAllowanceTypes(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []); // Dependensi kosong

    // Fetch data saat komponen mount dan session sudah siap
    useEffect(() => {
        if (status === 'authenticated' && session?.user?.role === 'SUPER_ADMIN') {
            fetchAllowanceTypes();
        }
    }, [status, session, fetchAllowanceTypes]);

    // Handler untuk membuka modal
    const handleOpenModal = (type: AllowanceType | null = null) => {
        if (type) { // Edit mode
            setEditingType(type);
            setFormData({ id: type.id, name: type.name, description: type.description || '', isFixed: type.isFixed });
        } else { // Add mode
            setEditingType(null);
            setFormData({ id: '', name: '', description: '', isFixed: true });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingType(null); // Reset state modal
    };

    // Handler perubahan form
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // Handler submit form
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const url = editingType
            ? `/api/admin/allowance-types/${editingType.id}`
            : '/api/admin/allowance-types';
        const method = editingType ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description || null, // Kirim null jika kosong
                    isFixed: formData.isFixed
                }),
            });
            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.message || `Gagal menyimpan (${res.status})`);
            }
            handleCloseModal();
            fetchAllowanceTypes(); // Refresh list
        } catch (err: any) {
            setError(err.message); // Tampilkan error di modal atau halaman
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handler delete
    const handleDelete = async (id: string) => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus jenis tunjangan ini? Ini tidak dapat diurungkan.')) {
            return;
        }
        setError(null);
        try {
            const res = await fetch(`/api/admin/allowance-types/${id}`, { method: 'DELETE' });
            const result = await res.json(); // Baca response body JSON dari API
            if (!res.ok) {
                throw new Error(result.message || `Gagal menghapus (${res.status})`);
            }
            fetchAllowanceTypes(); // Refresh list
        } catch (err: any) {
            setError(err.message);
        }
    };

    // --- Render Logic ---
    if (status === 'loading') return <div>Loading session...</div>; // Atau tampilkan spinner global
    if (session?.user?.role !== 'SUPER_ADMIN') return <div className="p-4 text-red-600">Akses Ditolak. Hanya Super Admin.</div>;
    if (isLoading && !allowanceTypes.length) return <div>Loading data...</div>; // Spinner awal

    return (
        <div className="p-4 md:p-6">
            <h1 className="text-2xl font-semibold mb-4">Kelola Jenis Tunjangan</h1>

            {error && <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">Error: {error}</div>}

            <button onClick={() => handleOpenModal(null)} className="mb-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
                + Tambah Jenis Tunjangan
            </button>

            {/* Tampilkan Tabel Jenis Tunjangan */}
            <div className="overflow-x-auto shadow rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deskripsi</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tetap?</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isLoading && <tr><td colSpan={4} className="text-center py-4">Loading...</td></tr>}
                        {!isLoading && allowanceTypes.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-500">Belum ada data.</td></tr>}
                        {allowanceTypes.map(type => (
                            <tr key={type.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{type.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{type.description || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{type.isFixed ? 'Ya' : 'Tidak'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => handleOpenModal(type)} className="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                                    <button onClick={() => handleDelete(type.id)} className="text-red-600 hover:text-red-900">Hapus</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Tambah/Edit (Gunakan komponen Modal Anda) */}
            {isModalOpen && (
                 <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
                        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
                             {editingType ? 'Edit' : 'Tambah'} Jenis Tunjangan
                        </h3>
                         {error && <div className="mb-4 p-2 bg-red-100 text-red-700 border border-red-300 rounded text-sm">Error: {error}</div>}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nama Tunjangan</label>
                                <input type="text" name="name" id="name" value={formData.name} onChange={handleFormChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                            </div>
                            <div className="mb-4">
                                 <label htmlFor="description" className="block text-sm font-medium text-gray-700">Deskripsi (Opsional)</label>
                                 <textarea name="description" id="description" value={formData.description} onChange={handleFormChange} rows={3} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></textarea>
                            </div>
                             <div className="mb-4">
                                <label className="flex items-center">
                                    <input type="checkbox" name="isFixed" checked={formData.isFixed} onChange={handleFormChange} className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50" />
                                    <span className="ml-2 text-sm text-gray-600">Tunjangan Tetap?</span>
                                </label>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                 <button type="button" onClick={handleCloseModal} disabled={isSubmitting} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center disabled:opacity-50">
                                     Batal
                                </button>
                                <button type="submit" disabled={isSubmitting} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:opacity-50">
                                     {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                 </div>
            )}
        </div>
    );
}