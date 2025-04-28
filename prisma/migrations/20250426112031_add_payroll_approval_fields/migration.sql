/*
  Warnings:

  - You are about to alter the column `status` on the `payroll_runs` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(3))`.

*/
-- AlterTable
ALTER TABLE `payroll_runs` ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedById` VARCHAR(191) NULL,
    ADD COLUMN `rejectedAt` DATETIME(3) NULL,
    ADD COLUMN `rejectedById` VARCHAR(191) NULL,
    ADD COLUMN `rejectionReason` TEXT NULL,
    MODIFY `status` ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL';

-- CreateIndex
CREATE INDEX `payroll_runs_status_idx` ON `payroll_runs`(`status`);

-- AddForeignKey
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_runs` ADD CONSTRAINT `payroll_runs_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
