-- DropIndex
DROP INDEX `refresh_tokens_userId_jti_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `attendance_settings` ADD COLUMN `allowedRadiusMeters` INTEGER NULL DEFAULT 300,
    ADD COLUMN `isLocationLockActive` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `targetLatitude` DECIMAL(9, 6) NULL,
    ADD COLUMN `targetLongitude` DECIMAL(9, 6) NULL;

-- CreateIndex
CREATE INDEX `refresh_tokens_jti_idx` ON `refresh_tokens`(`jti`);
