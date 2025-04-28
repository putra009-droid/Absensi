// src/lib/authMiddleware.ts
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
// Impor Role dari Prisma Client
import { Role } from '@prisma/client';

// Definisikan tipe payload yang ada di dalam JWT Anda
export interface TokenPayload {
    id: string;
    email: string;
    // Peran bisa berupa string jika token dibuat sebelum perubahan,
    // atau enum jika dibuat setelahnya. Kita tangani keduanya.
    role: Role | string;
    iat: number; // Issued at (otomatis oleh jwt.sign)
    exp: number; // Expiration time (otomatis oleh jwt.sign)
}

// Definisikan tipe Request yang sudah ditambahi informasi user dari token
export interface AuthenticatedRequest extends NextRequest {
    user?: TokenPayload;
}

// Tipe untuk handler API route Anda
type ApiHandler = (
    req: AuthenticatedRequest,
    context?: { params: Record<string, string | string[]> }
) => Promise<NextResponse>;

// Fungsi HOC (Higher-Order Component) untuk membungkus handler API
export function withAuth(
    handler: ApiHandler,
    requiredRole?: Role // Menerima Enum Role sebagai parameter
): (req: NextRequest, context?: { params: Record<string, string | string[]> }) => Promise<NextResponse> {
    return async (req: NextRequest, context?: { params: Record<string, string | string[]> }) => {
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.split(' ')[1]; // Ambil token setelah "Bearer "

        if (!token) {
            console.warn('[Auth Middleware] Failed: No token provided.');
            return NextResponse.json({ message: 'Akses Ditolak: Token otorisasi tidak ditemukan.' }, { status: 401 });
        }

        try {
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                // Ini adalah error kritis di sisi server
                console.error('[Auth Middleware] CRITICAL: JWT_SECRET environment variable is not set!');
                throw new Error('Konfigurasi server error.');
            }

            // Verifikasi token
            const decoded = jwt.verify(token, jwtSecret) as TokenPayload;

            // --- Otorisasi Berdasarkan Role ---
            // Jika endpoint ini memerlukan role spesifik, cek role dari token
            if (requiredRole) {
                 // Bandingkan nilai string dari enum dengan nilai dari token
                 // Ini lebih aman karena nilai dalam token JWT adalah string
                 if (decoded.role !== requiredRole) {
                     console.warn(`[Auth Middleware] Forbidden Check: User Role='${decoded.role}' (type: ${typeof decoded.role}), Required Role='${requiredRole}' (type: ${typeof requiredRole})`);
                     // Jika peran tidak cocok, kembalikan 403 Forbidden
                     return NextResponse.json({ message: `Akses Ditolak: Hak akses tidak memadai.` }, { status: 403 });
                 }
            }
            // --- Akhir Otorisasi ---

            // Modifikasi request untuk menambahkan informasi user yang terautentikasi
            const authenticatedReq = req as AuthenticatedRequest;
            authenticatedReq.user = decoded;
            console.log(`[Auth Middleware] User ${decoded.id} authenticated. Role: ${decoded.role}. Accessing: ${req.nextUrl.pathname}`);

            // Panggil handler API asli dengan request yang sudah dimodifikasi
            return await handler(authenticatedReq, context);

        } catch (error: unknown) {
            console.error('[Auth Middleware] JWT Verification or Handler Error:', error);
            // Tangani error spesifik dari JWT
            if (error instanceof jwt.TokenExpiredError) {
              return NextResponse.json({ message: 'Akses Ditolak: Token kedaluwarsa.' }, { status: 401 });
            }
            if (error instanceof jwt.JsonWebTokenError) {
              // Sertakan pesan error JWT untuk debugging jika perlu
              return NextResponse.json({ message: `Akses Ditolak: Token tidak valid.` /* Error: ${error.message} */ }, { status: 401 });
            }
            // Tangani error lain
            return NextResponse.json({ message: 'Terjadi kesalahan internal pada server.' }, { status: 500 });
        }
    };
}
