-- ADDITIVE ONLY. Raw model reply (truncated 20KB) for parse-failure diagnosis.
-- Already applied to production via Supabase MCP (migration name:
-- add_raw_response_to_document_import_pages). Idempotent.
ALTER TABLE document_import_pages ADD COLUMN IF NOT EXISTS raw_response TEXT;
