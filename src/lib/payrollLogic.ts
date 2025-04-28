// src/lib/payrollLogic.ts

import { Prisma, DeductionCalculationType, User, AllowanceType, DeductionType, PrismaClient } from '@prisma/client';
import { prisma } from './prisma'; // Pastikan path prisma client benar
import { getRekapBulanan } from './attendanceLogic'; // Gunakan rekap absensi yang sudah ada

// Interface untuk hasil kalkulasi slip gaji per user
export interface CalculatedPayslipDetails {
    baseSalary: Prisma.Decimal;
    totalAllowance: Prisma.Decimal;
    grossPay: Prisma.Decimal;
    totalDeduction: Prisma.Decimal;
    netPay: Prisma.Decimal;
    // Detail absensi untuk referensi
    attendanceDays: number;
    lateDays: number;
    alphaDays: number;
    workingDaysInPeriod: number; // Jumlah hari kerja dalam periode
    // Rincian item slip gaji
    items: Array<{
        type: 'ALLOWANCE' | 'DEDUCTION';
        description: string;
        amount: Prisma.Decimal;
    }>;
}

/**
 * Menghitung detail slip gaji untuk satu pengguna dalam periode tertentu.
 * @param userId - ID pengguna yang akan dihitung.
 * @param periodStart - Tanggal mulai periode (misal: 2025-04-01).
 * @param periodEnd - Tanggal akhir periode (misal: 2025-04-30).
 * @param prismaTx - Opsional: Prisma Transaction Client jika dipanggil dalam transaksi.
 * @returns Objek CalculatedPayslipDetails atau null jika user/gaji tidak ditemukan.
 */
export async function calculatePayslipForUser(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    prismaTx?: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"> // Type untuk Prisma Transaction Client
): Promise<CalculatedPayslipDetails | null> {

    const db = prismaTx || prisma; // Gunakan transaction client jika ada, jika tidak gunakan prisma biasa

    try {
        // 1. Ambil Data User dan Gaji Pokok
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user || user.baseSalary === null || user.baseSalary === undefined) {
            console.warn(`User ${userId} not found or has no base salary. Skipping payroll calculation.`);
            return null; // User tidak valid atau tidak punya gaji pokok
        }
        const baseSalary = new Prisma.Decimal(user.baseSalary); // Pastikan Decimal

        // Inisialisasi nilai
        let totalAllowance = new Prisma.Decimal(0);
        let totalDeduction = new Prisma.Decimal(0);
        const payslipItems: CalculatedPayslipDetails['items'] = [];

        // Tambahkan Gaji Pokok sebagai item pertama (jika diinginkan ditampilkan)
        // payslipItems.push({ type: 'ALLOWANCE', description: 'Gaji Pokok', amount: baseSalary });

        // 2. Ambil Rekap Absensi untuk Periode Tersebut
        // PERHATIAN: getRekapBulanan mungkin perlu disesuaikan jika periode bisa lintas bulan
        // atau jika Anda perlu rekap hanya untuk rentang tanggal spesifik dalam 1 bulan.
        // Asumsi saat ini periode = 1 bulan kalender penuh.
        const year = periodStart.getFullYear();
        const month = periodStart.getMonth(); // 0-11
        // TODO: Handle error jika getRekapBulanan gagal
        const attendanceRecap = await getRekapBulanan(userId, year, month); // Menggunakan fungsi yang ada
        const attendanceDays = attendanceRecap.totalHadir;
        const lateDays = attendanceRecap.totalTerlambat;
        const alphaDays = attendanceRecap.totalAlpha;
        const workingDaysInPeriod = attendanceRecap.totalHariKerja; // Hari kerja efektif user di bulan itu

        // 3. Ambil dan Hitung Tunjangan Tetap Pengguna
        const userAllowances = await db.userAllowance.findMany({
            where: { userId: userId },
            include: { allowanceType: true } // Sertakan detail tipe tunjangan
        });

        userAllowances.forEach(ua => {
            // Asumsi semua UserAllowance adalah tunjangan tetap per periode payroll
            if (ua.amount) {
                const allowanceAmount = new Prisma.Decimal(ua.amount);
                totalAllowance = totalAllowance.add(allowanceAmount);
                payslipItems.push({
                    type: 'ALLOWANCE',
                    description: ua.allowanceType.name, // Gunakan nama dari tipe tunjangan
                    amount: allowanceAmount
                });
            }
        });

        // 4. Hitung Gaji Kotor (Gross Pay)
        // Definisi Gaji Kotor bisa bervariasi, di sini contoh: Gaji Pokok + Semua Tunjangan Tetap
        const grossPay = baseSalary.add(totalAllowance);

        // 5. Ambil dan Hitung Semua Jenis Potongan yang Berlaku
        const applicableDeductions = await db.deductionType.findMany({
             // Ambil semua tipe potongan untuk dievaluasi
             // Anda bisa filter di sini jika ada tipe yang tidak relevan
        });
        const userSpecificDeductions = await db.userDeduction.findMany({
            where: { userId: userId },
            include: { deductionType: true } // Include tipe untuk akses calculationType
        });

        // Buat Map untuk userSpecificDeductions agar mudah diakses
        const userDeductionsMap = new Map(userSpecificDeductions.map(ud => [ud.deductionTypeId, ud]));

        // Proses setiap jenis potongan
        for (const dt of applicableDeductions) {
            let deductionAmount = new Prisma.Decimal(0);
            const userDeduction = userDeductionsMap.get(dt.id); // Cek apakah ada override/nilai spesifik user

            switch (dt.calculationType) {
                case DeductionCalculationType.FIXED_USER:
                    // Hanya berlaku jika ada di UserDeduction
                    if (userDeduction?.assignedAmount) {
                        deductionAmount = new Prisma.Decimal(userDeduction.assignedAmount);
                    }
                    break;

                case DeductionCalculationType.PERCENTAGE_USER:
                    // Hanya berlaku jika ada di UserDeduction
                    if (userDeduction?.assignedPercentage) {
                        const percentage = new Prisma.Decimal(userDeduction.assignedPercentage);
                        // Tentukan basis perhitungan (misal: Gaji Pokok) - SESUAIKAN ATURAN BISNIS
                        const basis = baseSalary;
                        deductionAmount = basis.mul(percentage).div(100);
                    }
                    break;

                case DeductionCalculationType.PER_LATE_INSTANCE:
                    // Dihitung jika ada keterlambatan dan ruleAmount di DeductionType
                    if (lateDays > 0 && dt.ruleAmount) {
                        deductionAmount = new Prisma.Decimal(dt.ruleAmount).mul(lateDays);
                    }
                    break;

                case DeductionCalculationType.PER_ALPHA_DAY:
                    // Dihitung jika ada alpha dan ruleAmount di DeductionType
                    if (alphaDays > 0 && dt.ruleAmount) {
                        deductionAmount = new Prisma.Decimal(dt.ruleAmount).mul(alphaDays);
                    }
                    break;

                case DeductionCalculationType.PERCENTAGE_ALPHA_DAY:
                    // Dihitung jika ada alpha dan rulePercentage di DeductionType
                    if (alphaDays > 0 && dt.rulePercentage) {
                        // Perhitungan kompleks, perlu Gaji Harian sebagai basis
                        // Tentukan Gaji Harian (misal: Gaji Pokok / Hari Kerja Efektif Bulan Itu) - SESUAIKAN ATURAN BISNIS!
                        const effectiveWorkingDays = workingDaysInPeriod > 0 ? workingDaysInPeriod : 1; // Hindari pembagian nol
                        const dailySalary = baseSalary.div(effectiveWorkingDays);
                        const percentage = new Prisma.Decimal(dt.rulePercentage);
                        deductionAmount = dailySalary.mul(percentage).div(100).mul(alphaDays);
                    }
                    break;

                case DeductionCalculationType.MANDATORY_PERCENTAGE:
                    // Dihitung jika ada rulePercentage di DeductionType
                    if (dt.rulePercentage) {
                        const percentage = new Prisma.Decimal(dt.rulePercentage);
                        // Tentukan basis perhitungan (misal: Gaji Kotor) - SESUAIKAN ATURAN BISNIS
                        const basis = grossPay; // Menggunakan Gaji Kotor sebagai contoh
                        deductionAmount = basis.mul(percentage).div(100);
                    }
                    break;

                // Tambahkan case untuk tipe potongan lain jika ada
                default:
                    console.warn(`[Payroll Logic] Unhandled deduction calculation type: ${dt.calculationType} for DeductionType ID: ${dt.id}`);
            }

            // Jika ada jumlah potongan, tambahkan ke total dan item slip gaji
            if (deductionAmount.greaterThan(0)) {
                 // Pembulatan jika perlu (misal ke 2 desimal)
                 // deductionAmount = deductionAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
                totalDeduction = totalDeduction.add(deductionAmount);
                payslipItems.push({
                    type: 'DEDUCTION',
                    description: dt.name, // Gunakan nama dari tipe potongan
                    amount: deductionAmount
                });
            }
        }

        // 6. Hitung Gaji Bersih (Net Pay)
        const netPay = grossPay.sub(totalDeduction);

        console.log(`[Payroll Logic] Calculated payslip for User ${userId} for period ${periodStart.toISOString().split('T')[0]} - ${periodEnd.toISOString().split('T')[0]}: Net Pay = ${netPay}`);

        // 7. Kembalikan Hasil Kalkulasi Terstruktur
        return {
            baseSalary,
            totalAllowance,
            grossPay,
            totalDeduction,
            netPay,
            attendanceDays,
            lateDays,
            alphaDays,
            workingDaysInPeriod,
            items: payslipItems
        };

    } catch (error) {
        console.error(`[Payroll Logic Error] Failed to calculate payslip for User ${userId}:`, error);
        // Lemparkan error agar bisa ditangani oleh pemanggil (misal: transaction rollback)
        throw error; // Atau return null jika ingin melanjutkan user lain meski ada yg error
    }
}