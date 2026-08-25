/**
 * Phase 9-web — pure readers over a `StepInstance.stepSnapshot` blob.
 *
 * These two functions were born in `inspection-handlers.ts`, which is the right
 * place for the *view* layer but the wrong place to import from
 * `src/server/services/workflows`: that module pulls `inspection-lookup` and
 * `inspection-service`, and therefore Prisma, `after()` and the notification
 * stack. A workflow service importing all of that to ask one question about a
 * JSON blob is a dependency cycle waiting to be discovered at runtime.
 *
 * So the two pure readers live here, with no imports at all, and
 * `inspection-handlers.ts` re-exports them unchanged — every existing caller and
 * the existing test keep working, and `failInspectionItem` can now read the same
 * answer the driver's screen reads. That sharing is the whole point: before
 * Phase 9-web the screen and the enforcement read DIFFERENT KEYS, which is the
 * defect ruling 8 names.
 */

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * Which section of the walkaround an item belongs to.
 *
 * NOT `PhaseType`. `playbookPhase` is `NONE` on all twelve steps
 * `seedStarterPlaybooks` writes, so grouping by it yields one section called
 * "None" and delivers nothing a driver can use.
 *
 * So: an explicit `section` key on `stepSnapshot.defaultConfig` when the tenant
 * has set one (a checklist author can add it without any schema change, because
 * `defaultConfig` is Json), falling back to `playbookPhase` when it is not NONE,
 * and finally to a single "Walkaround" section. Chunking a flat list into
 * arbitrary groups of N was rejected — a section boundary that does not mean
 * anything is worse than no boundary, because the driver reads it as one.
 */
const DEFAULT_SECTION = 'Walkaround';

export function sectionOf(snapshot: unknown): string {
  const snap = (snapshot ?? {}) as {
    defaultConfig?: { section?: unknown };
    overrideConfig?: { section?: unknown } | null;
    playbookPhase?: string;
  };
  const override = snap.overrideConfig?.section;
  if (typeof override === 'string' && override.trim() !== '') return override.trim();

  const fromConfig = snap.defaultConfig?.section;
  if (typeof fromConfig === 'string' && fromConfig.trim() !== '') return fromConfig.trim();

  if (snap.playbookPhase && snap.playbookPhase !== 'NONE') {
    return snap.playbookPhase.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
  return DEFAULT_SECTION;
}

// ---------------------------------------------------------------------------
// Whose step is it?
// ---------------------------------------------------------------------------

/**
 * Can THIS driver answer this step in the walkaround?
 *
 * quick-543. A tenant-built inspection can contain steps that are not the
 * driver's: "Pre-Trip Inspection v2" in the demo tenant has a `FORM_FILL` named
 * "Contact & Billing Details" assigned to `DISPATCHER`, sitting between fluid
 * levels and brakes. Before this, the driver's checklist rendered it with Pass /
 * Fail / N-A buttons and all three were refused by the server — Pass fails
 * `completeStep`'s FORM_FILL validation, Fail and N-A fail `findOwnStep`'s
 * `expectStepType` and its assignment arm. A card that looks answerable and is
 * not is a driver standing in a yard tapping a button that does nothing.
 *
 * The two conditions mirror `findOwnStep` EXACTLY, because that function is what
 * accepts or refuses the tap. Any drift between them re-creates the same bug in
 * the opposite direction — a step the driver could have answered, hidden.
 *
 *   - the step type must be INSPECTION_ITEM (the driver's three verbs all pass
 *     `expectStepType: 'INSPECTION_ITEM'`), and
 *   - it must be assigned to them by id, or offered to the DRIVER role with
 *     nobody assigned.
 *
 * `driverUserId` is the trip's primary driver. It coincides with the session
 * user by construction: `resolveInspectionAccess` has already refused anyone
 * else, so the person reading this screen IS that driver.
 *
 * NOTE this does NOT change what the gate counts. `buildSnapshot` has always
 * filtered its outcomes to INSPECTION_ITEM, so a DISPATCHER `FORM_FILL` and the
 * ad-hoc MECHANIC `APPROVAL` step that `failInspectionItem` creates were never
 * part of `isInspectionComplete`. This is a rendering rule, not a verdict rule.
 */
export function isDriverAnswerableStep(args: {
  stepType: string;
  assigneeRole: string | null | undefined;
  assignedUserId: string | null | undefined;
  driverUserId: string | null;
}): boolean {
  const { stepType, assigneeRole, assignedUserId, driverUserId } = args;
  if (stepType !== 'INSPECTION_ITEM') return false;
  if (assignedUserId) return !!driverUserId && assignedUserId === driverUserId;
  return assigneeRole === 'DRIVER';
}

// ---------------------------------------------------------------------------
// Photo requirement — the canonical key
// ---------------------------------------------------------------------------

/**
 * The canonical spelling of the "photo required when failed" config key.
 *
 * Exported so a WRITER never spells it inline. See `PHOTO_ON_FAIL_KEYS` for the
 * rule this is half of.
 */
export const PHOTO_ON_FAIL_KEY = 'requiresPhotoOnFail' as const;

/**
 * Every spelling of that one concept that exists in production, in PRECEDENCE
 * ORDER, each annotated with who writes it.
 *
 * quick-543 found the third. All three are real and all three are live:
 *
 *   1. `requiresPhotoOnFail`  — CANONICAL. `seedStarterPlaybooks` writes it on
 *      every inspection template it creates. 176 step templates, 16 tenants.
 *   2. `require_photo_on_fail` — snake_case. Written by the un-checked-in script
 *      that created the eight SAFETY/VEHICLE playbooks on 2026-04-24 (quick-542).
 *      35 step templates, 7 tenants. Read from `pg_enum`-adjacent live data, not
 *      inferred from the surrounding convention.
 *   3. `requiresPhoto` — the original. Only `failInspectionItem` ever enforced
 *      it, and no writer in this repo has ever produced it, so that enforcement
 *      was inert everywhere until Phase 9-web routed it through this function.
 *      0 step templates today; kept because a hand-authored `defaultConfig`
 *      would still be honoured, and silently switching someone's rule off is the
 *      exact failure this function exists to end.
 *
 * PRECEDENCE, not OR: **the first key PRESENT wins, even when its value is
 * `false`.** An explicit `requiresPhotoOnFail: false` beside a legacy
 * `requiresPhoto: true` means somebody turned the requirement off in the
 * modern key, and OR would silently override them. Verified against production
 * before choosing: zero step templates carry more than one of the three
 * (`multi_key = 0`), so this changes no existing behaviour — it only fixes the
 * meaning of a collision that has not happened yet.
 *
 * ── THE RULE, so there is no fourth ─────────────────────────────────────────
 *
 * quick-543 is the THIRD time one concept has appeared under multiple names in
 * this module (DEC-14's `resolved_via`, `bolRequired` vs `bol_required`, and now
 * this). The pattern is always the same: a JSON blob has no schema, so each
 * writer invents a spelling and each reader guesses one.
 *
 *   **A config key that a reader must interpret gets exactly one exported
 *   constant for writers and exactly one exported reader function for readers,
 *   both in the module that owns the concept. Writers import the constant;
 *   readers call the function; neither ever spells the key inline. An alias is
 *   added to the reader's list ONLY with a comment naming the writer that
 *   produced it and the live row count that proves it exists.**
 *
 * The constant is the half that actually prevents the fourth: a reader that
 * tolerates aliases makes drift survivable, but only a shared constant stops it
 * being created. `defaultConfig` is `Json` and cannot be typed at the database,
 * so this discipline is the only schema it will ever have.
 */
export const PHOTO_ON_FAIL_KEYS = [
  PHOTO_ON_FAIL_KEY,
  'require_photo_on_fail',
  'requiresPhoto',
] as const;

/**
 * Is a photo required when this item is failed?
 *
 * Reads the three spellings above in precedence order. `failInspectionItem`
 * calls this rather than reading a key itself, so the sentence on the driver's
 * screen and the rule the server enforces are the same sentence.
 */
export function requiresPhotoOnFail(snapshot: unknown): boolean {
  const cfg = ((snapshot ?? {}) as { defaultConfig?: Record<string, unknown> }).defaultConfig ?? {};
  for (const key of PHOTO_ON_FAIL_KEYS) {
    if (key in cfg) return cfg[key] === true;
  }
  return false;
}
