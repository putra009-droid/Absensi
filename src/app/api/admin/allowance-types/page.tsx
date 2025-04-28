'use client';

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface AllowanceType {
    id: string;
    name: string;
    description: string | null;
    isFixed: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export default function ManageAllowanceTypesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const token = session?.user?.token;

    const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingType, setEditingType] = useState<AllowanceType | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', isFixed: true });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Redirect if unauthenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            toast.error('Silakan login terlebih dahulu.');
            router.push('/auth/login');
        }
    }, [status, router]);

    const fetchAllowanceTypes = useCallback(async () => {
        if (!token) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/admin/allowance-types', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: `Gagal mengambil data (${res.status})` }));
                throw new Error(errorData.message);
            }
            const data: AllowanceType[] = await res.json();
            setAllowanceTypes(data);
        } catch (err: any) {
            console.error("Fetch Error:", err);
            setError(err.message || "Terjadi kesalahan saat mengambil data.");
            toast.error(`Gagal mengambil data: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchAllowanceTypes();
        }
    }, [token, fetchAllowanceTypes]);

    const handleOpenModal = (type: AllowanceType | null = null) => {
        setError(null);
        if (type) {
            setEditingType(type);
            setFormData({ name: type.name, description: type.description || '', isFixed: type.isFixed });
        } else {
            setEditingType(null);
            setFormData({ name: '', description: '', isFixed: true });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        if (isSubmitting) return;
        setIsModalOpen(false);
        setEditingType(null);
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        if (!token) {
            toast.error("Sesi tidak valid.");
            setIsSubmitting(false);
            return;
        }

        const url = editingType
            ? `/api/admin/allowance-types/${editingType.id}`
            : '/api/admin/allowance-types';
        const method = editingType ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description || null,
                    isFixed: formData.isFixed
                }),
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.message || `Gagal menyimpan (${res.status})`);
            }

            toast.success(`Jenis tunjangan berhasil ${editingType ? 'diperbarui' : 'ditambahkan'}!`);
            handleCloseModal();
            fetchAllowanceTypes();
        } catch (err: any) {
            console.error("Submit Error:", err);
            setError(err.message);
            toast.error(`Gagal menyimpan: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (isSubmitting) return;
        if (!window.confirm(`Apakah Anda yakin ingin menghapus jenis tunjangan "${name}"?`)) return;

        if (!token) {
            toast.error("Sesi tidak valid.");
            return;
        }

        try {
            const res = await fetch(`/api/admin/allowance-types/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.message || `Gagal menghapus (${res.status})`);
            }

            toast.success(`Jenis tunjangan "${name}" berhasil dihapus.`);
            fetchAllowanceTypes();
        } catch (err: any) {
            console.error("Delete Error:", err);
            setError(err.message);
            toast.error(`Gagal menghapus: ${err.message}`);
        }
    };

    // --- Render ---
    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold text-gray-800 mb-6">
                Kelola Jenis Tunjangan
            </h1>

            <div className="mb-4 text-right">
                <button
                    onClick={() => handleOpenModal(null)}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded shadow"
                >
                    + Tambah Jenis Tunjangan
                </button>
            </div>

            {isLoading && <p className="text-center text-gray-500 py-4">Memuat data...</p>}
            {!isLoading && error && !isModalOpen && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded" role="alert">
                    Error: {error}
                </div>
            )}

            {!isLoading && !error && (
                <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deskripsi</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tetap?</th>
                                <th className="px-6 py-3 relative text-right">
                                    <span className="sr-only">Aksi</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {allowanceTypes.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">Belum ada data jenis tunjangan.</td></tr>
                            )}
                            {allowanceTypes.map((type) => (
                                <tr key={type.id}>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{type.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{type.description || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{type.isFixed ? 'Ya' : 'Tidak'}</td>
                                    <td className="px-6 py-4 text-sm text-right">
                                        <button
                                            onClick={() => handleOpenModal(type)}
                                            className="text-indigo-600 hover:text-indigo-900 mr-3"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(type.id, type.name)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Hapus
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Form */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-600 bg-opacity-50 flex items-center justify-center">
                    <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            {editingType ? 'Edit' : 'Tambah'} Jenis Tunjangan
                        </h3>
                        {error && (
                            <div className="mb-4 p-2 bg-red-100 text-red-700 border border-red-300 rounded text-sm">
                                Error: {error}
                            </div>
                        )}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nama *</label>
                                <input
                                    type="text"
                                    name="name"
                                    id="name"
                                    value={formData.name}
                                    onChange={handleFormChange}
                                    required
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2"
                                />
                            </div>
                            <div className="mb-4">
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700">Deskripsi</label>
                                <textarea
                                    name="description"
                                    id="description"
                                    value={formData.description}
                                    onChange={handleFormChange}
                                    rows={3}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm px-3 py-2"
                                ></textarea>
                            </div>
                            <div className="mb-6">
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        name="isFixed"
                                        checked={formData.isFixed}
                                        onChange={handleFormChange}
                                        className="rounded border-gray-300 text-indigo-600 shadow-sm"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">Tunjangan Tetap?</span>
                                </label>
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Menyimpan...' : editingType ? 'Simpan Perubahan' : 'Tambah'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
