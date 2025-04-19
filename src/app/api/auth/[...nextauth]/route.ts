// File Lokasi: src/app/api/auth/[...nextauth]/route.ts

import NextAuth, { AuthOptions, User as NextAuthUser } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
// Import enum Role dari Prisma Client GENERATED (setelah migrate/generate)
// Jika ada error di sini, pastikan sudah menjalankan `npx prisma generate` setelah migrate
import { Role } from '@prisma/client';

// Mendefinisikan ulang tipe data Session dan User di NextAuth agar TypeScript tahu ada 'id' dan 'role'
declare module 'next-auth' {
  interface Session {
    user: { id: string; role: Role } & Omit<NextAuthUser, 'id'>; // Gunakan tipe Role dari Prisma
  }
  interface User extends Omit<NextAuthUser, 'id'> { // Definisikan User dengan tipe Role
    id: string;
    role: Role;
  }
}

declare module 'next-auth/jwt' {
  interface JWT { id: string; role: Role; } // Tambahkan role dengan tipe Role ke JWT
}

export const authOptions: AuthOptions = {
  // adapter: PrismaAdapter(prisma), // Aktifkan jika pakai session database

  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email dan password wajib diisi.');
        }

        // Cari user berdasarkan email
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        // Jika user tidak ada atau tidak punya password
        if (!user || !user.password) {
          throw new Error('Email atau password salah.');
        }

        // Bandingkan password
        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error('Email atau password salah.');
        }

        // --- BAGIAN PENTING UNTUK ROLE ---
        // Jika login berhasil, return object user yang menyertakan role
        // Pastikan nilai 'role' sesuai dengan tipe 'Role' yang diimpor dari @prisma/client
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role, // <-- Sertakan role dari database
        };
        // --- AKHIR BAGIAN PENTING ---
      },
    }),
    // ... provider lain bisa ditambahkan di sini ...
  ],

  session: { strategy: 'jwt' }, // Gunakan JWT untuk sesi
  secret: process.env.NEXTAUTH_SECRET, // Ambil dari .env

  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Callbacks untuk memastikan 'role' masuk ke token dan sesi
  callbacks: {
    async jwt({ token, user }) {
      // Saat user baru login (object 'user' ada), tambahkan id dan role ke token
      if (user) {
        token.id = user.id;
        token.role = user.role; // Ambil role dari object user hasil 'authorize'
      }
      return token;
    },
    async session({ session, token }) {
      // Ambil id dan role dari token JWT, lalu masukkan ke object session
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role; // Masukkan role ke sesi
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };