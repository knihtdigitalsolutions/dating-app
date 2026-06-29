/*
  Warnings:

  - You are about to drop the column `r2Key` on the `Photo` table. All the data in the column will be lost.
  - Added the required column `storageKey` to the `Photo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "r2Key",
ADD COLUMN     "storageKey" TEXT NOT NULL;
