-- ============================================================
-- Migration: 20260912120000_driver_pay_records_money_precision
--
-- Purpose: Bring driver_pay_records.bonuses / .tips / .deductions /
--          .reimbursements to numeric(12,2) on every database.
--
-- What drifted (see docs/audits/ledger-integrity.md):
--   production  oqdhberkghtnszrkdvfm : numeric(65,30)  <- unconstrained default
--   staging     wyixpgunnjmzguhggocz : numeric(8,2)    <- from 20260404100012
--   Both disagree with every sibling money column.
--
--   These four are the ONLY 4 of 110 Decimal fields in schema.prisma that
--   carried no @db.Decimal annotation, which is exactly why they drifted:
--   with no annotation Prisma emits the numeric(65,30) default, while the
--   hand-written migration declared numeric(8,2). Both are now annotated.
--
-- Why (12,2):
--   It matches grossRevenue in this same model, the four driver_settlements
--   money columns, and driver_bonuses.amount. The (8,2) declared by
--   20260404100012_driver_pay_records caps a single line at 999,999.99 and
--   agrees with nothing else in the ledger. (12,2) deliberately supersedes it:
--   after this migration a from-zero replay lands on (8,2) and then (12,2),
--   and a production that never received (8,2) lands directly on (12,2) --
--   the two agree, which is the point.
--
-- Safety:
--   On production this is a NARROWING cast (65,30 -> 12,2). The DO block
--   below refuses to run -- RAISE EXCEPTION, not a silent round -- if any
--   live row holds a sub-cent component or a value too large for (12,2).
--   Never round live money to make a migration pass.
--   No USING clause is used: the implicit numeric->numeric cast is exactly
--   what is wanted, and the assertion above it is what makes it safe.
--
-- Idempotency: every statement is individually guarded. A second run against
--   a database already at (12,2) skips each column and changes nothing.
--
-- NOTE: Do NOT wrap in BEGIN/COMMIT -- migrate.mjs wraps each
--       migration in its own transaction.
-- ============================================================


-- ============================================================
-- Section 1: Loss assertion -- refuse to narrow if any value would change
-- ============================================================

DO $$
DECLARE
  lossy_rows bigint;
BEGIN
  SELECT count(*) INTO lossy_rows
  FROM public.driver_pay_records
  WHERE (bonuses        IS NOT NULL AND (bonuses        <> round(bonuses,        2) OR abs(bonuses)        >= 10^10))
     OR (tips           IS NOT NULL AND (tips           <> round(tips,           2) OR abs(tips)           >= 10^10))
     OR (deductions     IS NOT NULL AND (deductions     <> round(deductions,     2) OR abs(deductions)     >= 10^10))
     OR (reimbursements IS NOT NULL AND (reimbursements <> round(reimbursements, 2) OR abs(reimbursements) >= 10^10));

  IF lossy_rows > 0 THEN
    RAISE EXCEPTION
      'ABORTING: % row(s) in public.driver_pay_records hold a bonuses/tips/deductions/reimbursements value that numeric(12,2) cannot represent without loss (a sub-cent component, or an absolute value >= 10^10). Resolve those values by hand before re-running this migration -- do NOT round live pay records to make it pass. Locate them with: SELECT id, bonuses, tips, deductions, reimbursements FROM public.driver_pay_records WHERE (bonuses IS NOT NULL AND (bonuses <> round(bonuses,2) OR abs(bonuses) >= 10^10)) OR (tips IS NOT NULL AND (tips <> round(tips,2) OR abs(tips) >= 10^10)) OR (deductions IS NOT NULL AND (deductions <> round(deductions,2) OR abs(deductions) >= 10^10)) OR (reimbursements IS NOT NULL AND (reimbursements <> round(reimbursements,2) OR abs(reimbursements) >= 10^10));',
      lossy_rows;
  END IF;

  RAISE NOTICE 'driver_pay_records money precision: loss assertion passed (0 rows would change value).';
END $$;


-- ============================================================
-- Section 2: Guarded type change, one loop over the four columns
--            (a loop rather than four pasted blocks -- four
--             near-identical blocks is how the fourth ends up
--             naming the wrong column)
-- ============================================================

DO $$
DECLARE
  target_col   text;
  cur_precision integer;
  cur_scale     integer;
BEGIN
  FOREACH target_col IN ARRAY ARRAY['bonuses', 'tips', 'deductions', 'reimbursements'] LOOP
    SELECT c.numeric_precision, c.numeric_scale
      INTO cur_precision, cur_scale
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = 'driver_pay_records'
      AND c.column_name  = target_col;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ABORTING: public.driver_pay_records.% does not exist.', target_col;
    END IF;

    IF cur_precision = 12 AND cur_scale = 2 THEN
      RAISE NOTICE 'driver_pay_records.% is already numeric(12,2) -- skipping.', target_col;
    ELSE
      RAISE NOTICE 'driver_pay_records.%: numeric(%,%) -> numeric(12,2)', target_col, cur_precision, cur_scale;
      EXECUTE format('ALTER TABLE public.driver_pay_records ALTER COLUMN %I TYPE numeric(12,2)', target_col);
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- Section 3: Report the final types
-- ============================================================

DO $$
DECLARE
  final_types text;
BEGIN
  SELECT string_agg(
           format('%s numeric(%s,%s)', c.column_name, c.numeric_precision, c.numeric_scale),
           ', ' ORDER BY c.column_name)
    INTO final_types
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name   = 'driver_pay_records'
    AND c.column_name IN ('bonuses', 'tips', 'deductions', 'reimbursements', 'base_pay', 'net_pay');

  RAISE NOTICE 'driver_pay_records final money types: %', final_types;
END $$;
