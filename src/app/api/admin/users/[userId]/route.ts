// Lokasi File: src/app/api/admin/users/[userId]/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface GetUserResponse {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  baseSalary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UpdateUserRequestBody {
    name?: string;
    role?: Role;
    baseSalary?: string | number | null;
}

// =====================================================================
// ===                  FUNGSI GET (Get User Details)                ===
// =====================================================================
export async function GET(
  request: Request,
  // Perbaikan: Tipe params sekarang Promise
  { params }: { params: Promise<{ userId: string }> }
) {
  // Deklarasikan userId di scope luar untuk logging error
  let userId: string | undefined;
  try {
    // Lakukan await pertama (jika ada)
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized. Please login first.' }, { status: 401 });
    }
    if (session.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ message: 'Forbidden. Only Super Admin can access this resource.' }, { status: 403 });
    }

    // --- Perbaikan: Await params sebelum mengakses propertinya ---
    const awaitedParams = await params;
    userId = awaitedParams.userId; // Assign ke variabel scope luar
    // --- Akhir Perbaikan ---

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ message: 'Invalid or missing user ID in URL path.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { /* ... fields ... */
        id: true, name: true, email: true, role: true,
        baseSalary: true, createdAt: true, updatedAt: true
      }
    });

    if (!user) {
      return NextResponse.json({ message: `User with ID '${userId}' not found.` }, { status: 404 });
    }

    const responseData: GetUserResponse = {
      ...user,
      baseSalary: user.baseSalary?.toString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });

  } catch (error: unknown) {
    const userIdForLog = userId ?? 'unknown'; // Gunakan userId jika sudah di-assign
    console.error(`[API GET /admin/users/${userIdForLog}] Error:`, error instanceof Error ? error.message : error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ message: 'Database error occurred.', errorCode: error.code }, { status: 500 });
    }
    return NextResponse.json({ message: 'Internal server error.' }, { status: 500 });
  }
}


// =====================================================================
// ===                  FUNGSI PUT (Update User Data)                ===
// =====================================================================
export async function PUT(
  request: Request,
  // Perbaikan: Tipe params sekarang Promise
  { params }: { params: Promise<{ userId: string }> }
) {
  let userIdToUpdate: string | undefined;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized. Please login first.' }, { status: 401 });
    }
    if (session.user.role !== Role.SUPER_ADMIN) {
      return NextResponse.json({ message: 'Forbidden. Only Super Admin can update user data.' }, { status: 403 });
    }

    // --- Perbaikan: Await params sebelum mengakses propertinya ---
    const awaitedParams = await params;
    userIdToUpdate = awaitedParams.userId;
    // --- Akhir Perbaikan ---

    if (!userIdToUpdate || typeof userIdToUpdate !== 'string') {
      return NextResponse.json({ message: 'Invalid or missing user ID in URL path.' }, { status: 400 });
    }

    let requestData: UpdateUserRequestBody;
    try {
      requestData = await request.json();
    } catch (_error) {
      return NextResponse.json({ message: 'Invalid request body format. Expected JSON.' }, { status: 400 });
    }

    // ... (Sisa validasi input: name, role, baseSalary, dll. tetap sama) ...
    const { name, role, baseSalary: rawBaseSalary } = requestData;
    if (!name || typeof name !== 'string' || name.trim() === '') { return NextResponse.json({ message: 'Name is required and cannot be empty.' }, { status: 400 }); }
    if (!role) { return NextResponse.json({ message: 'Role is required.' }, { status: 400 }); }
    if (!Object.values(Role).includes(role as Role)) { return NextResponse.json({ message: `Role '${role}' is invalid.` }, { status: 400 }); }
    if (role === Role.SUPER_ADMIN) { return NextResponse.json({ message: `Assigning SUPER_ADMIN role is not permitted via this route.` }, { status: 400 }); }
    if (userIdToUpdate === session.user.id && session.user.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
        const superAdminCount = await prisma.user.count({ where: { role: Role.SUPER_ADMIN }});
        if (superAdminCount <= 1) { return NextResponse.json({ message: 'The last Super Admin cannot change their own role.' }, { status: 400 }); }
    }
    let salaryToSave: Prisma.Decimal | null = null;
    if (rawBaseSalary !== null && rawBaseSalary !== undefined && rawBaseSalary !== '') {
        const salaryNumber = Number(rawBaseSalary);
        if (isNaN(salaryNumber) || salaryNumber < 0) { return NextResponse.json({ message: 'Base Salary must be a positive number or empty/null.' }, { status: 400 }); }
        salaryToSave = new Prisma.Decimal(salaryNumber);
    }
    // ... (Akhir validasi input) ...


    const dataToUpdate: Prisma.UserUpdateInput = {
        name: name.trim(),
        role: role as Role,
        baseSalary: salaryToSave,
    };

    const updatedUser = await prisma.user.update({
      where: { id: userIdToUpdate },
      data: dataToUpdate,
      select: { /* ... fields ... */
        id: true, name: true, email: true, role: true,
        updatedAt: true, baseSalary: true
      }
    });

    const serializableResponse = {
         ...updatedUser,
         baseSalary: updatedUser.baseSalary?.toString() ?? null,
         updatedAt: updatedUser.updatedAt.toISOString()
    }
    console.log(`User ${updatedUser.email} (ID: ${userIdToUpdate}) updated by ${session.user.email} via PUT /api/admin/users/${userIdToUpdate}`);
    return NextResponse.json({ message: 'User data successfully updated!', user: serializableResponse }, { status: 200 });

  } catch (error: unknown) {
    const userIdForLog = userIdToUpdate ?? 'unknown'; // Gunakan userId jika sudah di-assign
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) { errorMessage = error.message; }
    console.error(`[API PUT /admin/users/${userIdForLog}] Error:`, errorMessage, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') { return NextResponse.json({ message: `User with ID '${userIdForLog}' not found.` }, { status: 404 }); }
      return NextResponse.json({ message: `Database error.`, code: error.code }, { status: 500 });
    }

    // Error umum lainnya
    return NextResponse.json({ message: 'Failed to update user data due to an internal server error.' }, { status: 500 });
  }
}