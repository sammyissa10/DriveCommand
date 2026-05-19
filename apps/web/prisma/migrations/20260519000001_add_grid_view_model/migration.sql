-- CreateTable
CREATE TABLE "grid_view" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gridId" VARCHAR(100) NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "grid_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grid_view_gridId_userId_name_key" ON "grid_view"("gridId", "userId", "name");

-- CreateIndex
CREATE INDEX "grid_view_gridId_userId_idx" ON "grid_view"("gridId", "userId");

-- AddForeignKey
ALTER TABLE "grid_view" ADD CONSTRAINT "grid_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
