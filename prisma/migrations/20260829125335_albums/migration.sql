-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "albumId" TEXT;

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "licence" "Licence" NOT NULL DEFAULT 'ALL_RIGHTS_RESERVED',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "suggestedPriceCents" INTEGER NOT NULL DEFAULT 0,
    "minimumPriceCents" INTEGER NOT NULL DEFAULT 0,
    "coverImageUrl" TEXT,
    "vendorId" TEXT NOT NULL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "earningsCents" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlbumItem" (
    "albumId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "AlbumItem_pkey" PRIMARY KEY ("albumId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Album_slug_key" ON "Album"("slug");

-- CreateIndex
CREATE INDEX "Album_category_status_publishedAt_idx" ON "Album"("category", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Album_vendorId_status_idx" ON "Album"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Album_status_publishedAt_idx" ON "Album"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "AlbumItem_productId_idx" ON "AlbumItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AlbumItem_albumId_position_key" ON "AlbumItem"("albumId", "position");

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE SET NULL ON UPDATE CASCADE;
