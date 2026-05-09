-- Add sequence field to Load for multi-leg route ordering
ALTER TABLE "Load" ADD COLUMN "sequence" INTEGER;

-- Composite index for efficient ordering by routeId + sequence
CREATE INDEX "Load_routeId_sequence_idx" ON "Load"("routeId", "sequence");
