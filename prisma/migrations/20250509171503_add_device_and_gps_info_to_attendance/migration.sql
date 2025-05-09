-- AlterTable
ALTER TABLE `attendance_records` ADD COLUMN `deviceModel` VARCHAR(191) NULL,
    ADD COLUMN `deviceOS` VARCHAR(191) NULL,
    ADD COLUMN `gpsAccuracyIn` DECIMAL(10, 2) NULL,
    ADD COLUMN `gpsAccuracyOut` DECIMAL(10, 2) NULL,
    ADD COLUMN `isMockLocationIn` BOOLEAN NULL DEFAULT false,
    ADD COLUMN `isMockLocationOut` BOOLEAN NULL DEFAULT false;
