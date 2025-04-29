// src/app/api/refresh-token/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt, { Secret, SignOptions, JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken'; // Impor Secret & SignOptions
import { Prisma, Role } from '@prisma/client';

// --- Konfigurasi Token ---
const JWT_SECRET = process.env.JWT_SECRET;
// PERBAIKAN: Definisikan expiry dalam detik (15 menit = 900 detik)
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;

// Interface payload (tetap sama)
interface RefreshTokenJwtPayload {
    userId: string;
    type: 'refresh';
    iat: number;
    exp: number;
    jti: string;
}

export async function POST(req: Request) {
    if (!JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
        return NextResponse.json({ error: 'Kesalahan konfigurasi server.' }, { status: 500 });
    }
    const secret: Secret = JWT_SECRET; // Gunakan tipe Secret

    let receivedRefreshToken: string | undefined;
    let decoded: RefreshTokenJwtPayload;

    try {
        try {
            const body = await req.json();
            receivedRefreshToken = body.refreshToken;
        } catch (e) {
             return NextResponse.json({ error: 'Format request tidak valid (JSON diperlukan).' }, { status: 400 });
        }

        if (!receivedRefreshToken || typeof receivedRefreshToken !== 'string') {
            return NextResponse.json({ error: 'Refresh token diperlukan.' }, { status: 400 });
        }

        try {
            decoded = jwt.verify(receivedRefreshToken, secret) as RefreshTokenJwtPayload;
            if (decoded.type !== 'refresh' || !decoded.jti || !decoded.userId) {
                 throw new jwt.JsonWebTokenError('Invalid token payload: missing jti, userId, or wrong type');
            }
        } catch (error) {
            console.warn('[API Refresh Token] JWT verification failed:', error);
            if (error instanceof TokenExpiredError) {
                return NextResponse.json({ error: 'Refresh token kedaluwarsa.', code: 'TOKEN_EXPIRED' }, { status: 401 });
            }
             if (error instanceof JsonWebTokenError) {
                return NextResponse.json({ error: 'Refresh token tidak valid.', code: 'TOKEN_INVALID' }, { status: 401 });
            }
            return NextResponse.json({ error: 'Gagal memverifikasi refresh token.', code: 'TOKEN_VERIFICATION_FAILED' }, { status: 401 });
        }

        console.log(`[API Refresh Token] Refresh token JWT validated. User ID: ${decoded.userId}, JTI: ${decoded.jti}`);

        let tokenRecord = null;
        try {
            tokenRecord = await prisma.refreshToken.findUnique({ where: { jti: decoded.jti } });

            let isInvalidInDb = false;
            if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date() || tokenRecord.userId !== decoded.userId) {
                isInvalidInDb = true;
            }

            if (isInvalidInDb) {
                 console.warn(`[API Refresh Token] Refresh token jti: ${decoded.jti} for user ${decoded.userId} failed DB validation.`);
                 if (tokenRecord) {
                     await prisma.refreshToken.delete({ where: { id: tokenRecord.id } }).catch(e => console.error("Failed to delete invalid refresh token record:", e));
                 }
                 return NextResponse.json({ error: 'Sesi refresh tidak valid atau sudah berakhir.', code: 'SESSION_INVALID' }, { status: 401 });
            }

            console.log(`[API Refresh Token] Refresh token reference jti: ${decoded.jti} validated in DB for user ${decoded.userId}`);

            const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
            if (!user) {
                console.error(`User ${decoded.userId} not found for valid refresh token jti ${decoded.jti}. Invalidating token.`);
                if (tokenRecord) {
                    await prisma.refreshToken.delete({ where: { id: tokenRecord.id } }).catch(e => console.error("Failed to delete refresh token record for non-existent user:", e));
                }
                return NextResponse.json({ error: 'Pengguna tidak ditemukan.', code: 'USER_NOT_FOUND' }, { status: 401 });
            }

            // 5. Generate Access Token Baru
            const newAccessTokenPayload = { id: user.id, email: user.email, role: user.role };
            // PERBAIKAN: Gunakan expiry dalam detik
            const newAccessTokenOptions: SignOptions = { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS }; // <-- Gunakan detik
            const newAccessToken = jwt.sign(newAccessTokenPayload, secret, newAccessTokenOptions);
            console.log(`[API Refresh Token] New access token generated for user ${user.id}`);

            // 6. Kirim Access Token Baru ke Klien
            return NextResponse.json({
                accessToken: newAccessToken,
                expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS // Kirim expiry detik jika perlu
            });

        } catch (dbError) {
             console.error(`[API Refresh Token] Database check error for jti ${decoded?.jti}:`, dbError);
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