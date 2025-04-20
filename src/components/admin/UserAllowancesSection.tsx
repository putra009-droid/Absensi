// src/components/admin/UserAllowancesSection.tsx
'use client'; // Komponen ini interaktif, perlu dijalankan di client

import React, { useState, useEffect, useCallback } from 'react';

// --- Tipe Data ---
interface UserAllowance {
    id: string;
    amount: string; // Amount sudah string dari API (hasil serialisasi Decimal)
    userId: string;
    allowanceTypeId: string;
    allowanceType: { // Data dari relasi AllowanceType
        id: string;
        name: string;
    }
    // createdAt, updatedAt (opsional jika perlu)
}

interface AllowanceTypeOption { // Untuk dropdown tambah
    id: string;
    name: string;
}

// --- Props Komponen ---
interface UserAllowancesSectionProps {
    userId: string; // Menerima ID pengguna yang sedang diedit
}

// --- Komponen Utama ---
export function UserAllowancesSection({ userId }: UserAllowancesSectionProps) {
    // --- State ---
    const [assignedAllowances, setAssignedAllowances] = useState<UserAllowance[]>([]); // Tunjangan yang dimiliki user
    const [allAllowanceTypes, setAllAllowanceTypes] = useState<AllowanceTypeOption[]>([]); // Semua jenis tunjangan (untuk dropdown)
    const [isLoading, setIsLoading] = useState(true); // Status loading data awal
    const [error, setError] = useState<string | null>(null); // Pesan error

    // State untuk Form Tambah
    const [newAllowanceData, setNewAllowanceData] = useState({ allowanceTypeId: '', amount: '' });
    const [isAdding, setIsAdding] = useState(false); // Status loading saat menambah

    // State untuk Edit Inline
    const [editingId, setEditingId] = useState<string | null>(null); // ID UserAllowance yang sedang diedit
    const [editingAmount, setEditingAmount] = useState(''); // Nilai amount saat diedit
    const [isUpdating, setIsUpdating] = useState<string | null>(null); // ID UserAllowance yang sedang diupdate

    // State untuk Delete
    const [isDeleting, setIsDeleting] = useState<string | null>(null); // ID UserAllowance yang sedang dihapus

    // --- Fungsi Fetch Data ---
    const fetchData = useCallback(async () => {
        // Jangan fetch jika tidak ada userId
        if (!userId) {
             setError("User ID tidak valid.");
             setIsLoading(false);
             return;
        }

        setIsLoading(true);
        setError(null); // Reset error setiap kali fetch ulang
        try {
            // Ambil data secara paralel
            const [resAssigned, resTypes] = await Promise.all([
                fetch(`/api/admin/users/${userId}/allowances`),
                fetch('/api/admin/allowance-types') // Ambil semua jenis untuk dropdown
            ]);

            // Proses response tunjangan pengguna
            if (!resAssigned.ok) {
                const errData = await resAssigned.json().catch(() => ({ message: `Gagal fetch tunjangan user (${resAssigned.status})` }));
                throw new Error(errData.message);
            }
            const dataAssigned: UserAllowance[] = await resAssigned.json();
            setAssignedAllowances(dataAssigned);

            // Proses response jenis tunjangan
            if (!resTypes.ok) {
                 const errData = await resTypes.json().catch(() => ({ message: `Gagal fetch jenis tunjangan (${resTypes.status})` }));
                throw new Error(errData.message);
            }
            const dataTypes: AllowanceTypeOption[] = await resTypes.json();
            setAllAllowanceTypes(dataTypes);

        } catch (err: any) {
            console.error("Fetch Data Error:", err);
            setError(err.message || "Terjadi kesalahan saat mengambil data.");
        } finally {
            setIsLoading(false);
        }
    }, [userId]); // Dependensi hanya userId

    // Panggil fetchData saat komponen pertama kali dimuat atau userId berubah
    useEffect(() => {
        fetchData();
    }, [fetchData]); // Hanya panggil fetchData saat fungsinya (dan dependensinya userId) berubah

    // --- Handlers untuk Form Tambah ---
    const handleAddFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setNewAllowanceData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAllowanceData.allowanceTypeId || !newAllowanceData.amount) {
             setError("Pilih jenis tunjangan dan masukkan jumlah.");
             return;
        }
        // Validasi amount sederhana
        if (isNaN(Number(newAllowanceData.amount)) || Number(newAllowanceData.amount) < 0) {
             setError("Jumlah harus angka positif.");
             return;
        }

        setIsAdding(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/users/${userId}/allowances`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowanceTypeId: newAllowanceData.allowanceTypeId,
                    amount: newAllowanceData.amount // API akan handle konversi ke Decimal
                })
            });
            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.message || `Gagal menambah (${res.status})`);
            }
            setNewAllowanceData({ allowanceTypeId: '', amount: '' }); // Reset form setelah sukses
            fetchData(); // Refresh daftar tunjangan
        } catch (err: any) {
             console.error("Add Allowance Error:", err);
            setError(err.message);
        } finally {
            setIsAdding(false);
        }
    };

     // --- Handlers untuk Edit Inline ---
    const handleEditClick = (allowance: UserAllowance) => {
        setEditingId(allowance.id);
        setEditingAmount(allowance.amount); // Amount sudah string
        setError(null); // Hapus error lama saat mulai edit
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditingAmount('');
    };

     const handleEditAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditingAmount(e.target.value);
    };

    const handleEditSubmit = async (userAllowanceId: string) => {
         if (!editingAmount) {
              setError("Jumlah tidak boleh kosong.");
              return;
         };
         if (isNaN(Number(editingAmount)) || Number(editingAmount) < 0) {
             setError("Jumlah harus angka positif.");
             return;
         }

         setIsUpdating(userAllowanceId); // Tandai ID ini sedang diupdate
         setError(null);
         try {
             const res = await fetch(`/api/admin/users/${userId}/allowances/${userAllowanceId}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ amount: editingAmount }) // API handle konversi
             });
             const result = await res.json();
             if (!res.ok) {
                 throw new Error(result.message || `Gagal update (${res.status})`);
             }
             handleCancelEdit(); // Keluar dari mode edit setelah sukses
             fetchData(); // Refresh daftar
         } catch (err: any) {
              console.error("Update Allowance Error:", err);
             setError(err.message); // Tampilkan error
         } finally {
             setIsUpdating(null); // Selesai loading update
         }
    };

    // --- Handler untuk Delete ---
    const handleDelete = async (userAllowanceId: string) => {
        // Konfirmasi sederhana
        if (!window.confirm('Apakah Anda yakin ingin menghapus tunjangan ini dari pengguna?')) return;

        setIsDeleting(userAllowanceId); // Tandai ID ini sedang dihapus
        setError(null);
        try {
             const res = await fetch(`/api/admin/users/${userId}/allowances/${userAllowanceId}`, {
                 method: 'DELETE'
             });
             const result = await res.json(); // API kita mengembalikan JSON message
             if (!res.ok) {
                 throw new Error(result.message || `Gagal hapus (${res.status})`);
             }
             fetchData(); // Refresh daftar
        } catch (err: any) {
             console.error("Delete Allowance Error:", err);
            setError(err.message);
        } finally {
             setIsDeleting(null); // Selesai loading delete
        }
    };

    // --- Filter Opsi Dropdown Tambah ---
    // Hanya tampilkan jenis tunjangan yang belum dimiliki user
    const availableAllowanceTypes = allAllowanceTypes.filter(
        type => !assignedAllowances.some(a => a.allowanceTypeId === type.id)
    );


    // --- Render Komponen ---
    return (
        <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-4">
                Tunjangan Pengguna
            </h3>

            {/* Tampilkan Error Global */}
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded text-sm" role="alert">
                    Error: {error}
                </div>
            )}

             {/* Tampilkan Loading Awal */}
             {isLoading && <p className="text-gray-500 italic">Memuat data tunjangan...</p>}

            {/* Tabel Tunjangan yang Dimiliki */}
            {!isLoading && (
                <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg mb-6">
                     <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis Tunjangan</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jumlah (Rp)</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                            </tr>
                        </thead>
                         <tbody className="bg-white divide-y divide-gray-200">
                             {assignedAllowances.length === 0 && (
                                  <tr><td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-500">Belum ada tunjangan ditetapkan.</td></tr>
                             )}
                             {assignedAllowances.map(ua => (
                                 <tr key={ua.id} className={`${isDeleting === ua.id || isUpdating === ua.id ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ua.allowanceType?.name ?? 'N/A'}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                                         {editingId === ua.id ? (
                                            // Input saat mode edit
                                            <input
                                                type="number"
                                                value={editingAmount}
                                                onChange={handleEditAmountChange}
                                                className="block w-full px-2 py-1 border border-indigo-300 rounded-md shadow-sm text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                min="0"
                                                step="any"
                                                disabled={isUpdating === ua.id} // Disable saat proses update
                                                aria-label={`Jumlah untuk ${ua.allowanceType?.name}`}
                                            />
                                         ) : (
                                             // Tampilkan jumlah terformat
                                             Number(ua.amount).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                         )}
                                    </td>
                                     <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {editingId === ua.id ? (
                                            // Tombol saat mode edit
                                            <>
                                                <button
                                                    onClick={() => handleEditSubmit(ua.id)}
                                                    disabled={isUpdating === ua.id || editingAmount === ua.amount} // Disable jika sama atau sedang update
                                                    className="text-green-600 hover:text-green-800 mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isUpdating === ua.id ? 'Menyimpan...' : 'Simpan'}
                                                </button>
                                                <button
                                                    onClick={handleCancelEdit}
                                                    disabled={isUpdating === ua.id}
                                                    className="text-gray-600 hover:text-gray-800 disabled:opacity-50"
                                                >
                                                    Batal
                                                </button>
                                            </>
                                        ) : (
                                             // Tombol default (Edit/Hapus)
                                             <>
                                                 <button
                                                     onClick={() => handleEditClick(ua)}
                                                     disabled={!!editingId || !!isDeleting || !!isUpdating} // Disable jika ada aksi lain berjalan
                                                     className="text-indigo-600 hover:text-indigo-900 mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                 >
                                                     Edit
                                                 </button>
                                                 <button
                                                     onClick={() => handleDelete(ua.id)}
                                                     disabled={!!editingId || !!isDeleting || !!isUpdating} // Disable jika ada aksi lain berjalan
                                                     className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                 >
                                                      {isDeleting === ua.id ? 'Menghapus...' : 'Hapus'}
                                                 </button>
                                             </>
                                        )}
                                    </td>
                                 </tr>
                             ))}
                        </tbody>
                     </table>
                </div>
            )}

            {/* Form Tambah Tunjangan Baru */}
            {!isLoading && (
                <form onSubmit={handleAddSubmit} className="border-t border-gray-200 pt-4">
                     <h4 className="text-md font-medium mb-2 text-gray-800">Tambah Tunjangan Baru</h4>
                     <div className="flex flex-wrap gap-4 items-end">
                          <div className="flex-grow sm:flex-grow-0">
                             <label htmlFor="allowanceTypeSelect" className="block text-sm font-medium text-gray-700 mb-1">Jenis Tunjangan</label>
                             <select
                                 id="allowanceTypeSelect"
                                 name="allowanceTypeId"
                                 value={newAllowanceData.allowanceTypeId}
                                 onChange={handleAddFormChange}
                                 required
                                 disabled={isAdding || availableAllowanceTypes.length === 0}
                                 className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                             >
                                 <option value="" disabled>-- Pilih Jenis --</option>
                                 {availableAllowanceTypes.length === 0 && <option value="" disabled>Semua jenis sudah ditambahkan</option>}
                                 {availableAllowanceTypes.map(type => (
                                     <option key={type.id} value={type.id}>{type.name}</option>
                                 ))}
                             </select>
                          </div>
                         <div className="flex-grow sm:flex-grow-0">
                             <label htmlFor="newAllowanceAmount" className="block text-sm font-medium text-gray-700 mb-1">Jumlah (Rp)</label>
                             <input
                                 id="newAllowanceAmount"
                                 type="number"
                                 name="amount"
                                 placeholder='Contoh: 500000'
                                 value={newAllowanceData.amount}
                                 onChange={handleAddFormChange}
                                 required
                                 min="0"
                                 step="any" // Memungkinkan desimal
                                 disabled={isAdding}
                                 className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
                             />
                         </div>
                         <div className="pt-5"> {/* Menyamakan tinggi dengan label+input */}
                             <button
                                type="submit"
                                disabled={isAdding || !newAllowanceData.allowanceTypeId || !newAllowanceData.amount}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                             >
                                 {isAdding ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Menambahkan...
                                    </>
                                ) : '+ Tambah'}
                             </button>
                         </div>
                     </div>
                </form>
             )}
        </div>
    );
}