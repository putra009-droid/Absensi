-- AlterTable
ALTER TABLE `attendancerecord` MODIFY `status` ENUM('HADIR', 'IZIN', 'SAKIT', 'ALPHA', 'CUTI', 'LIBUR', 'SELESAI', 'BELUM') NOT NULL DEFAULT 'HADIR';

-- CreateIndex
CREATE INDEX `AttendanceRecord_userId_status_idx` ON `AttendanceRecord`(`userId`, `status`);
