/*
  Warnings:

  - You are about to drop the column `hashedToken` on the `refresh_tokens` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[jti]` on the table `refresh_tokens` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `jti` to the `refresh_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `refresh_tokens_hashedToken_key` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `refresh_tokens` DROP COLUMN `hashedToken`,
    ADD COLUMN `jti` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `refresh_tokens_jti_key` ON `refresh_tokens`(`jti`);

-- CreateIndex
CREATE INDEX `refresh_tokens_userId_jti_idx` ON `refresh_tokens`(`userId`, `jti`);
