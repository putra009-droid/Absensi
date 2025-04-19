-- AlterTable
ALTER TABLE `attendancerecord` ADD COLUMN `latitudeIn` DECIMAL(9, 6) NULL,
    ADD COLUMN `latitudeOut` DECIMAL(9, 6) NULL,
    ADD COLUMN `longitudeIn` DECIMAL(9, 6) NULL,
    ADD COLUMN `longitudeOut` DECIMAL(9, 6) NULL;
