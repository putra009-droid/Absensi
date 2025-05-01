// src/lib/authMiddleware.ts
// Version with correct exports and generics for context.params

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client'; // Sesuaikan path import jika perlu

// Definisikan struktur payload yang Anda simpan di JWT
interface JwtPayload {
  id: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

// Definisikan tipe request yang sudah diautentikasi
// Menambahkan property 'user' yang berisi payload JWT
export interface AuthenticatedRequest extends NextRequest {
  user: JwtPayload; // Wajib ada setelah lolos middleware
}

// Definisikan tipe untuk context yang diterima handler API route dinamis
// Generic P akan mewakili struktur spesifik dari params, misal { allowanceTypeId: string }
// Default ke Record<string, never> jika tidak ada params dinamis
export interface RouteContext<P extends Record<string, string | string[]> = Record<string, never>> {
    params: P;
}

// Definisikan tipe untuk handler API route
// Menggunakan Generic <P> untuk tipe 'params' di dalam context.
export type ApiHandler<P extends Record<string, string | string[]> = Record<string, never>> =
  (
    request: AuthenticatedRequest, // Handler menerima request yang sudah ada info user
    context: RouteContext<P>       // Context dengan params yang tipenya spesifik (P)
  ) => Promise<NextResponse> | NextResponse; // Handler bisa async atau tidak

// Fungsi pembungkus withAuth, sekarang menggunakan Generic <P>
export function withAuth<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: ApiHandler<P>, // Handler yang dibungkus mengharapkan context dengan params tipe P
  requiredRole?: Role      // Role bisa opsional
) {
  // Fungsi async baru yang akan diekspor sebagai handler GET/POST/dll.
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const token = request.headers.get('authorization')?.split(' ')[1];

    if (!token) {
      console.warn(`[withAuth] Failed: No token provided for ${request.nextUrl.pathname}`);
      return NextResponse.json({ message: 'Akses Ditolak: Token otorisasi tidak ditemukan.' }, { status: 401 });
    }

    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error('[withAuth] CRITICAL: JWT_SECRET environment variable is not set!');
        return NextResponse.json({ message: 'Kesalahan konfigurasi server.' }, { status: 500 });
      }

      // Verifikasi token
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

      // Cek role jika diperlukan
      if (requiredRole && decoded.role !== requiredRole) {
        console.warn(`[withAuth] Failed: User ${decoded.id} (${decoded.role}) does not have required role ${requiredRole} for ${request.nextUrl.pathname}`);
        return NextResponse.json({ message: `Akses Ditolak: Memerlukan hak akses ${requiredRole}.` }, { status: 403 });
      }

      console.log(`[withAuth] Success: User ${decoded.id} (${decoded.role}) accessed ${request.nextUrl.pathname}`);

      // Buat objek request yang sudah diautentikasi
      const authenticatedRequest = request as AuthenticatedRequest;
      authenticatedRequest.user = decoded;

      // Panggil handler asli dengan request yang sudah diautentikasi dan context
      return handler(authenticatedRequest, context);

    } catch (error) {
      console.error(`[withAuth] JWT Verification Error for ${request.nextUrl.pathname}:`, error);
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof jwt.NotBeforeError) {
        return NextResponse.json({ message: `Akses Ditolak: Token tidak valid atau kedaluwarsa (${error.name}).` }, { status: 401 });
      }
      // Tangani error lain dengan lebih aman
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error.';
      return NextResponse.json({ message: `Kesalahan otentikasi internal: ${errorMessage}` }, { status: 500 });
    }
  };
}
