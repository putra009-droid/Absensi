-- AlterTable
ALTER TABLE `attendancerecord` ADD COLUMN `status` ENUM('HADIR', 'IZIN', 'SAKIT', 'ALPHA') NOT NULL DEFAULT 'HADIR';
