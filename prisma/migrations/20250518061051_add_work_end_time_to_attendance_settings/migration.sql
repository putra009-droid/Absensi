-- AlterTable
ALTER TABLE `attendance_settings` ADD COLUMN `workEndTimeHour` INTEGER NOT NULL DEFAULT 17,
    ADD COLUMN `workEndTimeMinute` INTEGER NOT NULL DEFAULT 0;
