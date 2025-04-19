import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getStatusHarian, DetailAbsensiHarian, StatusAbsensiHarian } from '@/lib/attendanceLogic';
import { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  try {
    // 1. Authentication Check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Anda harus login untuk mengakses ini' },
        { status: 401 }
      );
    }

    // 2. Get and Validate Date Parameter
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    
    let targetDate: Date;
    try {
      targetDate = dateParam ? new Date(dateParam) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      
      // Additional date validation
      if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      return NextResponse.json(
        { 
          success: false,
          message: 'Format tanggal tidak valid. Gunakan format YYYY-MM-DD',
          example: `${new Date().toISOString().split('T')[0]}`
        },
        { status: 400 }
      );
    }

    // 3. Get Attendance Status
    const statusHarian = await getStatusHarian(session.user.id, targetDate);
    
    // 4. Validate Response from getStatusHarian
    if (!statusHarian || !(statusHarian.tanggal instanceof Date)) {
      console.error('Invalid response from getStatusHarian:', statusHarian);
      return NextResponse.json(
        {
          success: false,
          message: 'Data absensi tidak valid',
          debug: { receivedData: statusHarian }
        },
        { status: 500 }
      );
    }

    // 5. Prepare Response Data
    const responseData = {
      success: true,
      data: {
        ...statusHarian,
        tanggal: statusHarian.tanggal.toISOString(),
        clockIn: statusHarian.clockIn?.toISOString() ?? null,
        clockOut: statusHarian.clockOut?.toISOString() ?? null,
        latitudeIn: statusHarian.latitudeIn?.toString() ?? null,
        longitudeIn: statusHarian.longitudeIn?.toString() ?? null,
        latitudeOut: statusHarian.latitudeOut?.toString() ?? null,
        longitudeOut: statusHarian.longitudeOut?.toString() ?? null,
      }
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error("API Error:", error);
    
    // Handle Prisma Errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          success: false,
          message: 'Database error',
          errorCode: error.code,
          meta: error.meta
        },
        { status: 500 }
      );
    }
    
    // Handle Generic Errors
    return NextResponse.json(
      {
        success: false,
        message: 'Terjadi kesalahan server',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}