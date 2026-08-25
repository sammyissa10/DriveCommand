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
// Photo requirement — the canonical key
// ---------------------------------------------------------------------------

/**
 * Is a photo required when this item is failed?
 *
 * **`requiresPhotoOnFail` is the canonical key** (Phase 9-web, ruling 8). It is
 * what `seedStarterPlaybooks` writes — on all twelve inspection templates — and
 * what the driver's screen has always read. `requiresPhoto` is the older
 * spelling that only `failInspectionItem` ever enforced, and since no seed
 * writes it, that enforcement has been inert on every seeded tenant since it
 * shipped.
 *
 * Both spellings are still read, deliberately and permanently. A tenant that
 * hand-authored `requiresPhoto` in a `defaultConfig` blob has a working rule
 * today, and narrowing to one key would silently switch their enforcement off —
 * the exact failure mode this function exists to end. Canonical means "what we
 * write and what we document", not "the only thing we accept".
 *
 * `failInspectionItem` now calls THIS function rather than reading
 * `requiresPhoto` itself, so the sentence on the driver's screen and the rule on
 * the server are the same sentence. See that file for what the alignment
 * changes in practice.
 */
export function requiresPhotoOnFail(snapshot: unknown): boolean {
  const cfg = ((snapshot ?? {}) as { defaultConfig?: Record<string, unknown> }).defaultConfig ?? {};
  return cfg.requiresPhotoOnFail === true || cfg.requiresPhoto === true;
}
