// Lokasi File: src/app/admin/users/page.tsx

// --- Import yang Diperlukan ---
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; // Sesuaikan path jika perlu
import { redirect } from 'next/navigation';
import Link from 'next/link';                       // Import Link untuk tombol Edit
import { Role, User } from '@prisma/client';        // Import tipe User dan Role
import { prisma } from '@/lib/prisma';              // Import instance Prisma
// --- IMPORT YANG BENAR UNTUK FORM TAMBAH ---
import AddUserForm from './_components/AddUserForm'; // Import komponen form tambah user
// --- Pastikan TIDAK ADA import EditUserForm di file ini ---

// --- Komponen Halaman Admin User (Server Component) ---
export default async function AdminUsersPage() {
  // 1. Ambil data sesi di server
  const session = await getServerSession(authOptions);

  // 2. Validasi Hak Akses: Hanya SUPER_ADMIN
  if (session?.user?.role !== Role.SUPER_ADMIN) {
    console.warn(`Akses ke /admin/users ditolak untuk user: ${session?.user?.email ?? 'Guest'} (Role: ${session?.user?.role})`);
    redirect('/'); // Redirect jika bukan Super Admin
  }

  // --- Mengambil Daftar Semua Pengguna dari Database ---
  let users: Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>[] = []; // Tipe data untuk user list
  let fetchUsersError: string | null = null; // Variabel untuk error fetch

  try {
    // Gunakan Prisma Client untuk mengambil semua user
    users = await prisma.user.findMany({
      // Pilih hanya kolom yang dibutuhkan (hindari password!)
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      // Urutkan berdasarkan tanggal dibuat, terbaru di atas
      orderBy: {
        createdAt: 'desc',
      }
    });
  } catch (error) {
    console.error("Gagal mengambil daftar pengguna:", error);
    fetchUsersError = "Gagal memuat daftar pengguna dari database.";
  }
  // --- Akhir Pengambilan Data Pengguna ---

  // 3. Render Halaman
  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow-md"> {/* Kontainer utama */}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 border-b pb-4">
          Manajemen Pengguna (Admin)
        </h1>

        {/* --- Bagian Form Tambah Pengguna Baru --- */}
        <div className="mb-10 p-6 bg-gray-50 rounded-md border">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Tambah Pengguna Baru</h2>
          {/* Render komponen form tambah user yang BENAR */}
          <AddUserForm />
        </div>
        {/* --- Akhir Bagian Form Tambah --- */}


        {/* --- BAGIAN DAFTAR PENGGUNA --- */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Daftar Pengguna Terdaftar</h2>

          {/* Tampilkan pesan error jika fetch gagal */}
          {fetchUsersError && (
            <p className="text-red-600 bg-red-100 p-3 rounded mb-4">{fetchUsersError}</p>
          )}

          {/* Tampilkan tabel jika tidak ada error fetch */}
          {!fetchUsersError && (
            <div className="overflow-x-auto border rounded-md shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  {/* Header Tabel */}
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal Dibuat</th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Aksi</span> {/* Kolom untuk tombol aksi */}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Kondisi jika tidak ada pengguna */}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                        Belum ada pengguna terdaftar.
                      </td>
                    </tr>
                  )}
                  {/* Loop untuk setiap pengguna dalam data 'users' */}
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      {/* Kolom Nama */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name || '(Nama Belum Diisi)'}</td>
                      {/* Kolom Email */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                      {/* Kolom Role (dengan styling badge) */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.role === Role.SUPER_ADMIN ? 'bg-purple-100 text-purple-800' :
                            user.role === Role.YAYASAN ? 'bg-blue-100 text-blue-800' :
                            user.role === Role.REKTOR ? 'bg-indigo-100 text-indigo-800' :
                            user.role === Role.PR1 || user.role === Role.PR2 ? 'bg-cyan-100 text-cyan-800' :
                            'bg-gray-100 text-gray-800' // Default untuk EMPLOYEE
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      {/* Kolom Tanggal Dibuat */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {/* Format tanggal ke format Indonesia */}
                        {new Date(user.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      {/* Kolom Aksi (dengan Link Edit) */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/users/edit/${user.id}`} // URL dinamis ke halaman edit + ID user
                          className="text-indigo-600 hover:text-indigo-900 hover:underline" // Styling link
                        >
                          Edit
                        </Link>
                        {/* Placeholder untuk tombol Hapus nanti */}
                        {/* <button className="text-red-600 hover:text-red-900 ml-4">Hapus</button> */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* --- AKHIR BAGIAN DAFTAR PENGGUNA --- */}

      </div>
    </div>
  );
}