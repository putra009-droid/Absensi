// File Lokasi: src/app/api/auth/[...nextauth]/route.ts
// VERSI DEBUGGING SEDERHANA - DENGAN STRUKTUR authorize YANG BENAR

import NextAuth, { AuthOptions, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

// Mendefinisikan ulang tipe data Session dan User di NextAuth
declare module 'next-auth' {
  interface Session {
    user: { id: string; role: Role } & Omit<NextAuthUser, 'id'>;
  }
  interface User extends Omit<NextAuthUser, 'id'> {
    id: string;
    role: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT { id: string; role: Role; }
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // ================================================================
      // === TEMPATKAN FUNGSI authorize SEBAGAI VALUE DARI PROPERTY ===
      // ================================================================
      authorize: async (credentials) => { // Perhatikan sintaks property: async (credentials) => { ... }
        // Log paling atas untuk memastikan fungsi ini terpanggil
        console.log('!!!!!!!!!!!!!!!!!!!! AUTH_LOG: FUNGSI AUTHORIZE DIPANGGIL (Simplified Logic) !!!!!!!!!!!!!!!!!!!!');

        // 1. Validasi input dasar (tetap lakukan)
        if (!credentials?.email || !credentials?.password) {
          console.error('AUTH_LOG: [Authorize Simplified] Error: Email/Password required.');
          throw new Error('Email dan password wajib diisi.');
        }
        console.log('AUTH_LOG: [Authorize Simplified] Credentials exist.');

        // 2. === Lewati Pengecekan DB & Password untuk Tes ===
        console.log('AUTH_LOG: [Authorize Simplified] SKIPPING DB lookup & password check.');

        // 3. Buat objek user palsu (mock) untuk dikembalikan
        const mockUser = {
          id: "mock-user-id-123",
          name: "Test User (Mock)",
          email: credentials.email,
          image: null,
          role: Role.SUPER_ADMIN // Pastikan Role diimpor
        };

        // 4. Log objek yang akan dikembalikan
        console.log('AUTH_LOG: [Authorize Simplified] Returning MOCK user object:', mockUser);
        return mockUser; // Kembalikan objek mock
      } // <<< Akhir dari fungsi authorize
      // ================================================================

    }), // <<< Akhir dari CredentialsProvider({})
    // ... provider lain jika ada ...
  ],

  // Konfigurasi sesi, secret, dan pages tetap diperlukan
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET, // Pastikan ini ada di .env
  pages: {
    signIn: '/login',
    error: '/login',
  },

  // --- Callbacks, Events, Debug bisa dikosongkan sementara ---
  callbacks: {
      // Kosongkan atau gunakan log detail dari sebelumnya jika 'authorize' sudah terpanggil
      // async jwt({ token, user }) { console.log('JWT invoked'); return token; },
      // async session({ session, token }) { console.log('Session invoked'); return session; },
  },
  // events: {},
  // debug: false,
  // --- Akhir bagian yang dikosongkan ---
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };