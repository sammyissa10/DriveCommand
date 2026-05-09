-- Drop the document_type CHECK constraint.
-- Document type validation is now handled at the application layer
-- via the CarrierDocumentType catalog (added in 20260422000001).
ALTER TABLE carrier_documents DROP CONSTRAINT carrier_documents_document_type_check;
