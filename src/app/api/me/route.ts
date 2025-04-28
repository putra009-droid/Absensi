import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'rahasia-dummy');
    return NextResponse.json({ message: 'Token valid', user: decoded });
  } catch (error) {
    return NextResponse.json({ error: 'Token tidak valid' }, { status: 401 });
  }
}
