import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface TokenPayload {
  id: string;
  email: string;
  role: Role | string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends NextRequest {
  user?: TokenPayload;
}

type ApiHandler = (
  req: AuthenticatedRequest,
  context?: { params?: any }
) => Promise<NextResponse>;

export function withAuth(
  handler: ApiHandler,
  requiredRole?: Role
): (req: NextRequest, context?: { params?: any }) => Promise<NextResponse> {
  return async (req: NextRequest, context?: { params?: any }) => {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      console.warn('[Auth Middleware] No token provided.');
      return NextResponse.json({ message: 'Akses Ditolak: Token tidak ditemukan.' }, { status: 401 });
    }

    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error('[Auth Middleware] JWT_SECRET is not set.');
        throw new Error('JWT_SECRET tidak dikonfigurasi di environment.');
      }

      const decoded = jwt.verify(token, jwtSecret) as TokenPayload;

      if (requiredRole && decoded.role !== requiredRole) {
        console.warn(`[Auth Middleware] Role mismatch: Token role=${decoded.role}, Required role=${requiredRole}`);
        return NextResponse.json({ message: 'Akses Ditolak: Hak akses tidak cukup.' }, { status: 403 });
      }

      const authenticatedReq = req as AuthenticatedRequest;
      authenticatedReq.user = decoded;

      console.log(`[Auth Middleware] Authenticated user ${decoded.id} with role ${decoded.role} accessing ${req.nextUrl.pathname}`);

      return await handler(authenticatedReq, context);

    } catch (error: unknown) {
      console.error('[Auth Middleware] Error verifying token:', error);

      if (error instanceof jwt.TokenExpiredError) {
        return NextResponse.json({ message: 'Akses Ditolak: Token kedaluwarsa.' }, { status: 401 });
      }
      if (error instanceof jwt.JsonWebTokenError) {
        return NextResponse.json({ message: 'Akses Ditolak: Token tidak valid.' }, { status: 401 });
      }

      return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
    }
  };
}
