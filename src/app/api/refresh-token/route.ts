// src/app/api/refresh-token/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt, { Secret, SignOptions, JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
// ===> Pastikan Prisma diimpor untuk error handling jika perlu <===
import { Prisma, Role } from '@prisma/client'; // Import Prisma namespace
import { v4 as uuidv4 } from 'uuid'; // Pastikan uuid terinstal

// --- Konfigurasi Token ---
const JWT_SECRET = process.env.JWT_SECRET;
// Definisikan expiry dalam detik (misal: 15 menit = 900 detik)
const ACCESS_TOKEN_EXPIRY_SECONDS = parseInt(process.env.ACCESS_TOKEN_EXPIRY_SECONDS || '900', 10); // Ambil dari env atau default 15 menit

// Interface payload refresh token JWT
interface RefreshTokenJwtPayload {
    userId: string;
    type: 'refresh'; // Pastikan type ini ada saat generate refresh token
    iat: number;
    exp: number;
    jti: string; // JWT ID
}

// Interface payload access token JWT (untuk generate baru)
interface AccessTokenJwtPayload {
    id: string;
    email: string;
    role: Role;
}

export async function POST(req: Request) {
    if (!JWT_SECRET) {
        console.error("[API Refresh Token] FATAL ERROR: JWT_SECRET environment variable is not set.");
        return NextResponse.json({ error: 'Kesalahan konfigurasi server.' }, { status: 500 });
    }
    const secret: Secret = JWT_SECRET;

    let receivedRefreshToken: string | undefined;
    let decoded: RefreshTokenJwtPayload;

    try {
        // 1. Parse Request Body
        try {
            const body = await req.json();
            receivedRefreshToken = body.refreshToken;
        } catch (e) {
             return NextResponse.json({ error: 'Format request tidak valid (JSON diperlukan).' }, { status: 400 });
        }

        if (!receivedRefreshToken || typeof receivedRefreshToken !== 'string') {
            return NextResponse.json({ error: 'Refresh token diperlukan.' }, { status: 400 });
        }

        // 2. Verifikasi JWT Refresh Token
        try {
            decoded = jwt.verify(receivedRefreshToken, secret) as RefreshTokenJwtPayload;
            // Validasi payload lebih ketat
            if (decoded.type !== 'refresh' || !decoded.jti || !decoded.userId) {
                 throw new jwt.JsonWebTokenError('Invalid token payload: missing jti, userId, or wrong type');
            }
        } catch (error) {
            console.warn('[API Refresh Token] JWT verification failed:', error instanceof Error ? error.message : error);
            if (error instanceof TokenExpiredError) {
                return NextResponse.json({ error: 'Refresh token kedaluwarsa.', code: 'REFRESH_TOKEN_EXPIRED' }, { status: 401 });
            }
             if (error instanceof JsonWebTokenError) {
                 return NextResponse.json({ error: 'Refresh token tidak valid.', code: 'REFRESH_TOKEN_INVALID' }, { status: 401 });
             }
            return NextResponse.json({ error: 'Gagal memverifikasi refresh token.', code: 'TOKEN_VERIFICATION_FAILED' }, { status: 401 });
        }

        console.log(`[API Refresh Token] Refresh token JWT validated. User ID: ${decoded.userId}, JTI: ${decoded.jti}`);

        // 3. Validasi Refresh Token di Database
        let tokenRecord = null;
        try {
            tokenRecord = await prisma.refreshToken.findUnique({
                 // Pastikan where clause menggunakan unique identifier yang benar
                 // Jika jti adalah unique, ini sudah benar
                 where: { jti: decoded.jti }
            });

            let isInvalidInDb = false;
            if (!tokenRecord) {
                console.warn(`[API Refresh Token] JTI ${decoded.jti} not found in DB.`);
                isInvalidInDb = true;
            } else if (tokenRecord.userId !== decoded.userId) {
                console.warn(`[API Refresh Token] User ID mismatch for JTI ${decoded.jti}. Token user: ${decoded.userId}, DB user: ${tokenRecord.userId}`);
                isInvalidInDb = true;
            } else if (tokenRecord.revokedAt) {
                console.warn(`[API Refresh Token] JTI ${decoded.jti} for user ${decoded.userId} has been revoked.`);
                isInvalidInDb = true;
            } else if (tokenRecord.expiresAt < new Date()) {
                console.warn(`[API Refresh Token] JTI ${decoded.jti} for user ${decoded.userId} has expired in DB.`);
                isInvalidInDb = true;
            }

            // Jika tidak valid di DB, hapus record (jika ditemukan) dan tolak request
            if (isInvalidInDb) {
                if (tokenRecord) {
                    await prisma.refreshToken.delete({ where: { id: tokenRecord.id } }).catch(e => console.error("Failed to delete invalid refresh token record:", e));
                }
                return NextResponse.json({ error: 'Sesi refresh tidak valid atau sudah berakhir.', code: 'SESSION_INVALID' }, { status: 401 });
            }

            console.log(`[API Refresh Token] Refresh token reference jti: ${decoded.jti} validated in DB for user ${decoded.userId}`);

            // 4. Ambil Data User untuk Access Token Baru
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, email: true, role: true } // Ambil field yang dibutuhkan untuk payload access token
            });
            if (!user) {
                console.error(`[API Refresh Token] User ${decoded.userId} not found for valid refresh token jti ${decoded.jti}. Invalidating token.`);
                if (tokenRecord) {
                    await prisma.refreshToken.delete({ where: { id: tokenRecord.id } }).catch(e => console.error("Failed to delete refresh token record for non-existent user:", e));
                }
                return NextResponse.json({ error: 'Pengguna terkait tidak ditemukan.', code: 'USER_NOT_FOUND' }, { status: 401 });
            }

            // 5. Generate Access Token Baru
            const newAccessTokenPayload: AccessTokenJwtPayload = { id: user.id, email: user.email, role: user.role };
            const newAccessTokenOptions: SignOptions = { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS };
            const newAccessToken = jwt.sign(newAccessTokenPayload, secret, newAccessTokenOptions);
            console.log(`[API Refresh Token] New access token generated for user ${user.id}`);

            // (Opsional: Implementasi Refresh Token Rotation di sini jika mau)
            // - Buat refreshToken baru (dengan JTI baru & expiry baru)
            // - Simpan refreshToken baru ke DB
            // - Tandai refreshToken lama (tokenRecord) sebagai revoked atau hapus
            // - Kirim refreshToken baru ke klien bersama accessToken baru

            // 6. Kirim Access Token Baru ke Klien
            return NextResponse.json({
                accessToken: newAccessToken,
                expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS // Kirim expiry detik jika perlu
                // refreshToken: newRefreshToken // Kirim jika pakai rotasi
            });

        } catch (dbError) {
             console.error(`[API Refresh Token] Database check error for jti ${decoded?.jti}:`, dbError);
             // Gunakan Prisma.PrismaClientKnownRequestError jika perlu penanganan spesifik
             if (dbError instanceof Prisma.PrismaClientKnownRequestError) {
                  return NextResponse.json({ error: 'Kesalahan database saat validasi sesi.', code: `DB_${dbError.code}` }, { status: 500 });
             }
             return NextResponse.json({ error: 'Gagal memvalidasi sesi refresh.', code: 'DB_ERROR' }, { status: 500 });
        }

    } catch (error: unknown) {
        console.error('[API Refresh Token - Unhandled Error]', error);
        let errorMessage = 'Terjadi kesalahan internal pada server.';
         if (error instanceof SyntaxError) {
             errorMessage = 'Format request tidak valid (JSON).';
             return NextResponse.json({ error: errorMessage }, { status: 400 });
         } else if (error instanceof Error) {
              errorMessage = error.message;
         }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
