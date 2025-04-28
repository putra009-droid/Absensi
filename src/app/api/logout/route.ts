// src/app/api/logout/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;

// Interface payload refresh token (sama seperti di refresh endpoint)
interface RefreshTokenJwtPayload {
    userId: string;
    type: 'refresh';
    iat: number;
    exp: number;
    jti: string;
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
            // Tetap kembalikan sukses jika token tidak ada, karena tujuan logout tercapai
            console.log("[API Logout] No refresh token provided in request body.");
            return NextResponse.json({ message: 'Tidak ada sesi aktif untuk di-logout.' });
        }

        // 2. Verifikasi Token (HANYA untuk mendapatkan jti & userId, expiry diabaikan)
        let decoded: RefreshTokenJwtPayload;
        try {
             // Verifikasi signature tapi abaikan expiry
             decoded = jwt.verify(receivedRefreshToken, JWT_SECRET, { ignoreExpiration: true }) as RefreshTokenJwtPayload;
             // Validasi payload minimal
             if (decoded.type !== 'refresh' || !decoded.jti || !decoded.userId) {
                 throw new jwt.JsonWebTokenError('Invalid token payload/type for logout');
             }
        } catch (error) {
             // Jika token tidak valid sama sekali (signature salah, format salah),
             // anggap saja sudah logout karena token itu tidak bisa dipakai lagi.
             console.warn('[API Logout] Failed to decode refresh token for logout (token might be invalid):', error);
             return NextResponse.json({ message: 'Token tidak valid atau sesi sudah berakhir.' });
        }

        // --- Jika token bisa di-decode ---
        console.log(`[API Logout] Logout requested for user ${decoded.userId} with refresh token jti: ${decoded.jti}`);

        // 3. Hapus/Revoke Refresh Token dari Database berdasarkan jti & userId
        try {
            // === LOGGING TAMBAHAN SEBELUM DELETE ===
            console.log(`[API Logout] Attempting to delete refresh token record where: jti=${decoded.jti}, userId=${decoded.userId}`);

            const deleteResult = await prisma.refreshToken.deleteMany({
                where: {
                    jti: decoded.jti,       // Targetkan jti yang benar
                    userId: decoded.userId // Pastikan milik user yang benar
                }
            });

             // === LOGGING TAMBAHAN SETELAH DELETE ===
            console.log(`[API Logout] Database delete operation result count: ${deleteResult.count}`);

            if (deleteResult.count > 0) {
                 console.log(`[API Logout] Refresh token jti: ${decoded.jti} for user ${decoded.userId} revoked successfully.`);
                 return NextResponse.json({ message: 'Logout berhasil.' });
            } else {
                 console.log(`[API Logout] Refresh token jti: ${decoded.jti} for user ${decoded.userId} not found in DB or already revoked during this request.`);
                 // Token tidak ditemukan (mungkin sudah logout sebelumnya atau tidak valid)
                 return NextResponse.json({ message: 'Sesi tidak ditemukan atau sudah logout.' });
            }

        } catch (dbError) {
             // Error saat mencoba menghapus dari DB
             console.error(`[API Logout] Failed to revoke refresh token jti ${decoded.jti} for user ${decoded.userId}:`, dbError);
             // Jangan gagalkan logout di sisi klien, tapi catat error di server
             return NextResponse.json({ error: 'Gagal memproses logout di server.' }, { status: 500 });
        }

    } catch (error: unknown) {
        console.error('[API Logout - Unhandled Error]', error);
        return NextResponse.json({ error: 'Terjadi kesalahan internal pada server.' }, { status: 500 });
    }
}