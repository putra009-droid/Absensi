// src/app/api/login/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions } from 'jsonwebtoken'; // Impor Secret & SignOptions
import { Prisma, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// --- Konfigurasi Token ---
const JWT_SECRET = process.env.JWT_SECRET;
// PERBAIKAN: Definisikan expiry dalam detik (15 menit = 900 detik)
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10);
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

export async function POST(req: Request) {
    if (!JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
        return NextResponse.json({ error: 'Kesalahan konfigurasi server.' }, { status: 500 });
    }
    const secret: Secret = JWT_SECRET; // Gunakan tipe Secret

    let email: string | undefined;
    let password: string | undefined;

    try {
        try {
            const body = await req.json();
            email = body.email;
            password = body.password;
        } catch (e) {
             return NextResponse.json({ error: 'Format request tidak valid (JSON diperlukan).' }, { status: 400 });
        }

        if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
            return NextResponse.json({ error: 'Email dan password wajib diisi dan harus berupa string.' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

        if (!user || !user.password) {
            return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 });
        }

        console.log(`[API Login] Password validation successful for user: ${user.email} (ID: ${user.id})`);

        // PERBAIKAN: Gunakan expiry dalam detik
        const accessTokenPayload = { id: user.id, email: user.email, role: user.role };
        const accessTokenOptions: SignOptions = { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS }; // <-- Gunakan detik
        const accessToken = jwt.sign(accessTokenPayload, secret, accessTokenOptions);
        console.log(`[API Login] Access token generated for user ${user.id}`);

        const refreshTokenExpiryDate = new Date();
        refreshTokenExpiryDate.setDate(refreshTokenExpiryDate.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        const refreshTokenJti = uuidv4();

        // Gunakan expiry dalam detik (sudah benar sebelumnya)
        const refreshTokenPayload = { userId: user.id, type: 'refresh' };
        const refreshTokenOptions: SignOptions = {
             expiresIn: REFRESH_TOKEN_EXPIRY_SECONDS, // <-- Ini sudah dalam detik
             jwtid: refreshTokenJti
        };
        const refreshToken = jwt.sign(refreshTokenPayload, secret, refreshTokenOptions);
        console.log(`[API Login] Refresh token (JWT) generated for user ${user.id} with jti: ${refreshTokenJti}`);

        try {
            await prisma.refreshToken.create({
                data: { userId: user.id, jti: refreshTokenJti, expiresAt: refreshTokenExpiryDate }
            });
            console.log(`[API Login] Refresh token reference STORED successfully in DB for user ${user.id}.`);
        } catch (dbError) {
            console.error(`[API Login] FAILED to save refresh token reference for user ${user.id}:`, dbError);
            return NextResponse.json({ error: 'Gagal memproses sesi login, coba lagi.' }, { status: 500 });
        }

        console.log(`[API Login] User ${user.email} logged in successfully. Tokens generated.`);
        return NextResponse.json({
            message: 'Login berhasil!',
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS, // Kirim expiry detik jika perlu
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });

    } catch (error: unknown) {
        console.error('[API Login - Unhandled Error]', error);
        let errorMessage = 'Terjadi kesalahan internal pada server.';
         if (error instanceof SyntaxError) {
            errorMessage = 'Format request tidak valid.';
            return NextResponse.json({ error: errorMessage }, { status: 400 });
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}