/*
  Warnings:

  - The primary key for the `Product` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "DiaryEntry" DROP CONSTRAINT "DiaryEntry_productId_fkey";

-- AlterTable
ALTER TABLE "DiaryEntry" ALTER COLUMN "productId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Product" DROP CONSTRAINT "Product_pkey";
ALTER TABLE "Product" ALTER COLUMN "id" SET DATA TYPE BIGINT;
-- Create a new sequence for autoincrement if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Product_id_seq') THEN
    CREATE SEQUENCE "Product_id_seq" OWNED BY "Product"."id";
  END IF;
END$$;
ALTER TABLE "Product" ALTER COLUMN "id" SET DEFAULT nextval('"Product_id_seq"');
ALTER TABLE "Product" ADD CONSTRAINT "Product_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
