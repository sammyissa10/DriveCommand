-- ADDITIVE ONLY. Per-slot resolution provenance for the document-import "why"
-- affordance: { client: { via, score, matchedText, byUserId, at }, contract: {...} }.
--
-- Already applied to production via Supabase MCP before this file was written,
-- and marked applied with `prisma migrate resolve --applied` rather than replayed,
-- per DEC-3 rules 1 and 4 — there is no non-production database to replay it
-- against. Idempotent regardless.
ALTER TABLE document_imports ADD COLUMN IF NOT EXISTS resolution_provenance JSONB;
