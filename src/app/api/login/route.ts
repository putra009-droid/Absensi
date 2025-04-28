// src/app/api/login/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Pastikan path benar
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client'; // Import Prisma & Role
import { v4 as uuidv4 } from 'uuid'; // Import UUID untuk jti

// --- Konfigurasi Token (Ambil dari Environment Variables) ---
const JWT_SECRET = process.env.JWT_SECRET;
// Default Access Token: 15 menit
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
// Default Refresh Token: 7 hari
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10);
// Konversi expiry refresh token ke detik untuk payload JWT
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;

export async function POST(req: Request) {
    // 0. Pastikan JWT_SECRET ada di environment
    if (!JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET environment variable is not set.");
        return NextResponse.json({ error: 'Kesalahan konfigurasi server.' }, { status: 500 });
    }

    let email: string | undefined;
    let password: string | undefined;

    try {
        // 1. Parse Request Body
        try {
            const body = await req.json();
            email = body.email;
            password = body.password;
        } catch (e) {
             return NextResponse.json({ error: 'Format request tidak valid (JSON diperlukan).' }, { status: 400 });
        }


        // 2. Validasi Input Dasar
        if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
            return NextResponse.json({ error: 'Email dan password wajib diisi dan harus berupa string.' }, { status: 400 });
        }

        // 3. Cari User berdasarkan Email
        const user = await prisma.user.findUnique({
             where: { email: email.toLowerCase() } // Normalisasi email ke lowercase
        });

        // 4. Handle User Tidak Ditemukan atau Tidak Punya Password
        if (!user || !user.password) {
            console.warn(`[API Login] Login attempt failed for email: ${email} - User not found or no password set.`);
            return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 }); // Unauthorized
        }

        // 5. Verifikasi Password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            console.warn(`[API Login] Login attempt failed for email: ${email} - Invalid password.`);
            return NextResponse.json({ error: 'Email atau password salah.' }, { status: 401 }); // Unauthorized
        }

        // --- Jika Login Berhasil ---
        console.log(`[API Login] Password validation successful for user: ${user.email} (ID: ${user.id})`);

        // 6. Generate Access Token (Masa Berlaku Singkat)
        const accessTokenPayload = {
            id: user.id,
            email: user.email,
            role: user.role // Sertakan role
        };
        const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, {
            expiresIn: ACCESS_TOKEN_EXPIRY
        });
        console.log(`[API Login] Access token generated for user ${user.id}`);

        // 7. Generate Refresh Token SEBAGAI JWT (Masa Berlaku Panjang)
        const refreshTokenExpiryDate = new Date();
        refreshTokenExpiryDate.setDate(refreshTokenExpiryDate.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
        const refreshTokenJti = uuidv4(); // Generate ID unik untuk JWT ini

        const refreshTokenPayload = {
            userId: user.id, // Simpan userId di payload refresh token
            type: 'refresh', // Tandai tipe token
        };
        const refreshToken = jwt.sign(refreshTokenPayload, JWT_SECRET, {
            expiresIn: `${REFRESH_TOKEN_EXPIRY_SECONDS}s`, // Gunakan expiry dalam detik
            jwtid: refreshTokenJti // Sertakan jti (JWT ID)
        });
        console.log(`[API Login] Refresh token (JWT) generated for user ${user.id} with jti: ${refreshTokenJti}`);

        // 8. Simpan Referensi Refresh Token (jti & expiry) ke Database
        try {
            // Opsional: Hapus token lama jika hanya boleh satu sesi aktif per user
            // await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

            const savedRecord = await prisma.refreshToken.create({ // <-- Simpan hasil create ke variabel
                data: {
                    userId: user.id,
                    jti: refreshTokenJti, // Simpan JWT ID
                    expiresAt: refreshTokenExpiryDate, // Simpan tanggal expiry
                }
            });
            // === LOG TAMBAHAN UNTUK VERIFIKASI PENYIMPANAN ===
            console.log(`[API Login] Refresh token reference STORED successfully in DB for user ${user.id}. Record ID: ${savedRecord.id}, JTI: ${savedRecord.jti}`);
            // ===============================================
        } catch (dbError) {
             // === LOG JIKA GAGAL SIMPAN ===
            console.error(`[API Login] FAILED to save refresh token reference for user ${user.id}:`, dbError);
             // ============================
            return NextResponse.json({ error: 'Gagal memproses sesi login, coba lagi.' }, { status: 500 });
        }

        // 9. Kirim Response ke Klien (Mobile App)
        console.log(`[API Login] User ${user.email} logged in successfully. Tokens generated.`);
        return NextResponse.json({
            message: 'Login berhasil!',
            accessToken: accessToken,       // Token utama untuk akses API
            refreshToken: refreshToken,     // Token JWT untuk refresh
            expiresIn: ACCESS_TOKEN_EXPIRY, // Info masa berlaku access token (opsional)
            user: {                         // Data user yang relevan
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
                // Jangan sertakan password hash
            }
        });

    } catch (error: unknown) {
        // Tangani error tak terduga
        console.error('[API Login - Unhandled Error]', error);
         if (error instanceof SyntaxError) { // Khusus jika body JSON tidak valid
            return NextResponse.json({ error: 'Format request tidak valid.' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Terjadi kesalahan internal pada server.' }, { status: 500 });
    }
}