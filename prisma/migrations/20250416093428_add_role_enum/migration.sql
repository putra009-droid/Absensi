/*
  Warnings:

  - You are about to alter the column `role` on the `user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(0))`.

*/
-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('SUPER_ADMIN', 'YAYASAN', 'REKTOR', 'PR1', 'PR2', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE';
