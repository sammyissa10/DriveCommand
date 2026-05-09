-- Add bolRequired and podRequired flags to carrier stops
-- These allow dispatchers to specify whether BOL/POD documents are required
-- before a driver can mark a stop as completed.

ALTER TABLE "stops"
  ADD COLUMN "bolRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "podRequired" BOOLEAN NOT NULL DEFAULT TRUE;
