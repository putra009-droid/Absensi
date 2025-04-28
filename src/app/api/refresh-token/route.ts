// src/app/api/refresh-token/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client'; // Import Role jika perlu

// --- Konfigurasi Token (Harus sama dengan di /api/login) ---
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';

// Interface untuk payload refresh token JWT yang diharapkan
interface RefreshTokenJwtPayload {
    userId: string;
    type: 'refresh'; // Pastikan tipenya benar
    iat: number;    // Issued at (otomatis)
    exp: number;    // Expiration time (otomatis)
    jti: string;    // JWT ID (WAJIB ada)
}

export async function POST(req: Request) {
    // Pastikan JWT_SECRET ada
    if (!JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
        return NextResponse.json({ error: 'Kesalahan konfigurasi server.' }, { status: 500 });
    }

    let receivedRefreshToken: string | undefined;

    try {
        // 1. Ambil Refresh Token JWT dari Body
        try {
            const body = await req.json();
            receivedRefreshToken = body.refreshToken;
        } catch (e) {
            return NextResponse.json({ error: 'Format request tidak valid (JSON diperlukan).' }, { status: 400 });
        }

        if (!receivedRefreshToken || typeof receivedRefreshToken !== 'string') {
            return NextResponse.json({ error: 'Refresh token diperlukan.' }, { status: 400 });
        }

        // 2. Verifikasi Refresh Token JWT
        let decoded: RefreshTokenJwtPayload;
        try {
            // Verifikasi signature & expiry JWT
            decoded = jwt.verify(receivedRefreshToken, JWT_SECRET, {
                // Audience atau Issuer bisa ditambahkan jika Anda menggunakannya saat sign
            }) as RefreshTokenJwtPayload;

            // Validasi tambahan pada payload
            if (decoded.type !== 'refresh' || !decoded.jti || !decoded.userId) {
                 throw new jwt.JsonWebTokenError('Invalid token payload: missing jti, userId, or wrong type');
            }

        } catch (error) {
            console.warn('[API Refresh Token] JWT verification failed:', error);
             // Tangani error spesifik JWT
            if (error instanceof jwt.TokenExpiredError) {
                return NextResponse.json({ error: 'Refresh token kedaluwarsa.', code: 'TOKEN_EXPIRED' }, { status: 401 });
            }
             if (error instanceof jwt.JsonWebTokenError) {
                return NextResponse.json({ error: 'Refresh token tidak valid.', code: 'TOKEN_INVALID' }, { status: 401 });
            }
            // Error lain saat verifikasi
            return NextResponse.json({ error: 'Gagal memverifikasi refresh token.', code: 'TOKEN_VERIFICATION_FAILED' }, { status: 401 });
        }

        // --- Jika JWT valid ---
        console.log(`[API Refresh Token] Refresh token JWT validated. User ID: ${decoded.userId}, JTI: ${decoded.jti}`);

        // 3. Cek Status Refresh Token di Database (berdasarkan jti)
        try {
            // === LOGGING TAMBAHAN SEBELUM FINDUNIQUE ===
            console.log(`[API Refresh Token] Attempting to find refresh token record with jti: ${decoded.jti}`);

            const tokenRecord = await prisma.refreshToken.findUnique({
                where: {
                    jti: decoded.jti, // Cari berdasarkan JWT ID
                }
            });

            // === LOGGING TAMBAHAN SETELAH FINDUNIQUE ===
            console.log("[API Refresh Token] Result from findUnique in DB:", JSON.stringify(tokenRecord, null, 2));

            // === LOGGING TAMBAHAN UNTUK KONDISI VALIDASI ===
            let isInvalidInDb = false;
            if (!tokenRecord) {
                console.log("[API Refresh Token] Validation check: !tokenRecord is TRUE");
                isInvalidInDb = true;
            } else {
                console.log("[API Refresh Token] Validation check: !tokenRecord is FALSE");
                console.log(`[API Refresh Token] Validation check: revokedAt exists? ${!!tokenRecord.revokedAt}`);
                console.log(`[API Refresh Token] Validation check: expired in DB? ${tokenRecord.expiresAt < new Date()} (Expires: ${tokenRecord.expiresAt.toISOString()}, Now: ${new Date().toISOString()})`);
                console.log(`[API Refresh Token] Validation check: user ID mismatch? ${tokenRecord.userId !== decoded.userId} (DB: ${tokenRecord.userId}, JWT: ${decoded.userId})`);
                if (tokenRecord.revokedAt || tokenRecord.expiresAt < new Date() || tokenRecord.userId !== decoded.userId) {
                    isInvalidInDb = true;
                }
            }
            // === AKHIR LOGGING TAMBAHAN UNTUK KONDISI ===

            // Cek kondisi gabungan
            if (isInvalidInDb) {
                 console.warn(`[API Refresh Token] Refresh token jti: ${decoded.jti} for user ${decoded.userId} failed DB validation (Not Found, Revoked, Expired, or User Mismatch).`);
                 // Jika tidak valid di DB, hapus saja (opsional)
                 if(tokenRecord) {
                     await prisma.refreshToken.delete({ where: { id: tokenRecord.id } }).catch(e => console.error("Failed to delete invalid refresh token record:", e));
                 }
                 return NextResponse.json({ error: 'Sesi refresh tidak valid atau sudah berakhir.', code: 'SESSION_INVALID' }, { status: 401 });
            }


            // --- Jika Refresh Token Valid di DB ---
            console.log(`[API Refresh Token] Refresh token reference jti: ${decoded.jti} validated in DB for user ${decoded.userId}`);

            // 4. Ambil Data User Terbaru (jika perlu info terbaru untuk access token)
            const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
            if (!user) {
                console.error(`User ${decoded.userId} not found for valid refresh token jti ${decoded.jti}. Invalidating token.`);
                // Jika user tidak ada, invalidasi token di DB
                await prisma.refreshToken.delete({ where: { id: tokenRecord.id } }).catch(e => console.error("Failed to delete refresh token record for non-existent user:", e));
                return NextResponse.json({ error: 'Pengguna tidak ditemukan.', code: 'USER_NOT_FOUND' }, { status: 401 });
            }

            // 5. Generate Access Token Baru
            const newAccessTokenPayload = {
                id: user.id,
                email: user.email,
                role: user.role // Sertakan role
            };
            const newAccessToken = jwt.sign(newAccessTokenPayload, JWT_SECRET, {
                expiresIn: ACCESS_TOKEN_EXPIRY
            });
            console.log(`[API Refresh Token] New access token generated for user ${user.id}`);

            // 6. Kirim Access Token Baru ke Klien
            return NextResponse.json({
                accessToken: newAccessToken,
                expiresIn: ACCESS_TOKEN_EXPIRY // Info expiry (opsional)
            });

        } catch (dbError) {
             console.error(`[API Refresh Token] Database check error for jti ${decoded?.jti}:`, dbError);
             return NextResponse.json({ error: 'Gagal memvalidasi sesi refresh.', code: 'DB_ERROR' }, { status: 500 });
        }

    } catch (error: unknown) {
        console.error('[API Refresh Token - Unhandled Error]', error);
        return NextResponse.json({ error: 'Terjadi kesalahan internal pada server.' }, { status: 500 });
    }
}