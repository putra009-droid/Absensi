-- CreateTable
CREATE TABLE `deduction_types` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `calculationType` ENUM('FIXED_USER', 'PERCENTAGE_USER', 'PER_LATE_INSTANCE', 'PER_ALPHA_DAY', 'PERCENTAGE_ALPHA_DAY', 'MANDATORY_PERCENTAGE') NOT NULL,
    `ruleAmount` DECIMAL(15, 2) NULL,
    `rulePercentage` DECIMAL(5, 2) NULL,
    `isMandatory` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `deduction_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_deductions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deductionTypeId` VARCHAR(191) NOT NULL,
    `assignedAmount` DECIMAL(15, 2) NULL,
    `assignedPercentage` DECIMAL(5, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_deductions_userId_idx`(`userId`),
    INDEX `user_deductions_deductionTypeId_idx`(`deductionTypeId`),
    UNIQUE INDEX `user_deductions_userId_deductionTypeId_key`(`userId`, `deductionTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_deductions` ADD CONSTRAINT `user_deductions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_deductions` ADD CONSTRAINT `user_deductions_deductionTypeId_fkey` FOREIGN KEY (`deductionTypeId`) REFERENCES `deduction_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
