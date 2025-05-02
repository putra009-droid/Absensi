-- CreateTable
CREATE TABLE `attendance_settings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'global_settings',
    `workStartTimeHour` INTEGER NOT NULL DEFAULT 8,
    `workStartTimeMinute` INTEGER NOT NULL DEFAULT 0,
    `lateToleranceMinutes` INTEGER NOT NULL DEFAULT 15,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
