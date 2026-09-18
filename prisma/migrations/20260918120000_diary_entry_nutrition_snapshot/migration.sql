-- Snapshot КБЖУ onto DiaryEntry so the diary no longer depends on Product.name.
-- Existing rows are filled from the related Product before the FK is dropped.

-- AlterTable
ALTER TABLE "DiaryEntry" ADD COLUMN "productName" TEXT,
ADD COLUMN "calories" DOUBLE PRECISION,
ADD COLUMN "protein" DOUBLE PRECISION,
ADD COLUMN "fat" DOUBLE PRECISION,
ADD COLUMN "carbs" DOUBLE PRECISION;

-- Backfill snapshot from Product
UPDATE "DiaryEntry" AS d
SET
    "productName" = p."name",
    "calories" = p."calories",
    "protein" = p."protein",
    "fat" = p."fat",
    "carbs" = p."carbs"
FROM "Product" AS p
WHERE d."productId" = p."id";

-- AlterTable
ALTER TABLE "DiaryEntry" ALTER COLUMN "productName" SET NOT NULL,
ALTER COLUMN "calories" SET NOT NULL,
ALTER COLUMN "protein" SET NOT NULL,
ALTER COLUMN "fat" SET NOT NULL,
ALTER COLUMN "carbs" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "DiaryEntry" DROP CONSTRAINT "DiaryEntry_productId_fkey";

-- AlterTable: keep the old Product.id as optional text identity for historical rows
ALTER TABLE "DiaryEntry" ALTER COLUMN "productId" DROP NOT NULL,
ALTER COLUMN "productId" SET DATA TYPE TEXT USING "productId"::TEXT;
