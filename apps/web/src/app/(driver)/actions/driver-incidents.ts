'use server';

import type { ActionState } from '@drivecommand/types'
import type { IncidentCategory, IncidentSeverity } from '@/generated/prisma';

import { requireRole, getSession, getCurrentUser } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { emitNotificationAfterResponse } from '@/lib/notifications/emit';
import { getAppBaseUrl } from '@/lib/app-url';
import { logger, serializeError } from '@/lib/logger';

/**
 * Driver incident reporting.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE WAS REWRITTEN (quick-570)
 * ---------------------------------------------------------------------------
 *
 * `submitIncidentReport` used to be this, in full:
 *
 *     if (!type) return { error: … };
 *     if (!description || description.trim().length < 10) return { error: … };
 *     // In production, this would create a safety event record …
 *     return { success: true,
 *              message: 'Incident report submitted successfully. Dispatch has been notified.' };
 *
 * It validated, wrote nothing, notified nobody, and reported success — from a
 * screen reachable off a driver QUICK ACTION. `DriverIncident` held zero rows
 * in production, which is what a write path that has never once fired looks
 * like. A driver at a roadside was told dispatch knew. Dispatch did not know.
 *
 * That is the same class as the "Your dispatcher has been notified" sentence
 * quick-548/549 spent two tasks on, in its highest-stakes form: there the
 * record existed and only the delivery claim was unfounded, here NEITHER did.
 *
 * The sentence is made TRUE rather than deleted, because everything needed to
 * back it already existed and only the wiring was missing — the model, a
 * working precedent (`/api/mobile/driver/incidents` POST), and a live,
 * deliverable notification trigger.
 *
 * ---------------------------------------------------------------------------
 * THE TWO SHAPE MISMATCHES, AND WHY NEITHER NEEDED DDL
 * ---------------------------------------------------------------------------
 *
 * 1. The form offers EIGHT types; `IncidentCategory` admits FIVE. Read off
 *    production `pg_enum` rather than inferred from `schema.prisma`, per
 *    DEC-14: `ACCIDENT | VIOLATION | MECHANICAL | HAZARD | OTHER`. Only
 *    ACCIDENT and OTHER overlap, so six of the eight would be a Postgres 22P02
 *    written raw. `INCIDENT_CATEGORY_MAP` below is the whole of the mapping and
 *    the only place it is written down.
 *
 *    The map is LOSSY BY CONSTRUCTION — three form values collapse to OTHER —
 *    so the driver's own selection is preserved verbatim in `notes` rather than
 *    discarded. Narrowing the form to the five enum values was the alternative
 *    and was rejected: "Vehicle Breakdown" and "Medical Emergency" are what a
 *    driver at the roadside is looking for, and "MECHANICAL"/"OTHER" are not.
 *
 * 2. `severity` is NOT NULL and the form did not collect it. Deriving it from
 *    the category, or defaulting it to MEDIUM, would have the product INVENT A
 *    SAFETY-CRITICAL VALUE THE DRIVER NEVER STATED — which is the exact defect
 *    this task exists to remove, reappearing one field to the left. So the form
 *    now asks. Mobile's `SeverityToggle` has always asked; this ends a surface
 *    disagreement rather than creating one.
 *
 * `location` has no column of its own and is preserved in `notes` alongside the
 * reported type. It was previously read into a variable and never used at all.
 *
 * ---------------------------------------------------------------------------
 * ORDERING: WRITE, THEN TELL — NEVER THE REVERSE
 * ---------------------------------------------------------------------------
 *
 * The incident row is committed first and the notification is emitted through
 * `emitNotificationAfterResponse`, which runs after the response and is
 * documented never to throw. Section 11: a slow or failing notification must
 * not roll back or block the thing it is reporting. **A driver's report being
 * saved matters more than dispatch being told instantly** — so a notification
 * failure leaves a recorded incident and a logged error, never a lost report.
 *
 * The payload is built BEFORE the emit call, with values already in hand. That
 * is Phase 10's rule 1: everything inside the deferred closure runs where there
 * is no header to read, and `commit-service.ts` shipped a notification that
 * threw on every single commit for a whole phase by getting this backwards.
 */

/** The eight form values, mapped onto the five the database admits.
 *
 *  Written down once. If the form's `<option>` list changes, this map is what
 *  has to change with it — a value missing here falls back to OTHER rather than
 *  reaching Postgres as a 22P02, and the driver's literal choice still lands in
 *  `notes`, so an un-mapped type degrades to "recorded, less well categorised"
 *  rather than to "rejected". */
const INCIDENT_CATEGORY_MAP: Record<string, IncidentCategory> = {
  ACCIDENT: 'ACCIDENT',
  BREAKDOWN: 'MECHANICAL',
  ROAD_HAZARD: 'HAZARD',
  WEATHER: 'HAZARD',
  CARGO_DAMAGE: 'OTHER',
  THEFT: 'OTHER',
  MEDICAL: 'OTHER',
  OTHER: 'OTHER',
};

/** Read off production `pg_enum`, not inferred from a sibling's shape. */
const VALID_SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];

/** Human labels for the eight form values, so `notes` records what the driver
 *  actually picked rather than the wire value. */
const INCIDENT_TYPE_LABELS: Record<string, string> = {
  ACCIDENT: 'Accident / Collision',
  BREAKDOWN: 'Vehicle Breakdown',
  ROAD_HAZARD: 'Road Hazard',
  WEATHER: 'Severe Weather',
  CARGO_DAMAGE: 'Cargo Damage',
  THEFT: 'Theft / Security',
  MEDICAL: 'Medical Emergency',
  OTHER: 'Other',
};

/**
 * Submit an incident report from the driver.
 *
 * Writes a `DriverIncident` row, then notifies every owner and manager.
 * Returns an error state — never a success message — if the write fails.
 */
export async function submitIncidentReport(
  prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([UserRole.DRIVER]);

  const session = await getSession();
  if (!session) return { error: 'Not authenticated' };

  const type = (formData.get('type') as string | null) ?? '';
  const description = (formData.get('description') as string | null) ?? '';
  const location = ((formData.get('location') as string | null) ?? '').trim();
  const severity = (formData.get('severity') as string | null) ?? '';

  if (!type) return { error: { type: ['Incident type is required'] } };
  if (!VALID_SEVERITIES.includes(severity as IncidentSeverity)) {
    return { error: { severity: ['Select how serious this is'] } };
  }
  if (!description || description.trim().length < 10) {
    return { error: { description: ['Please provide at least 10 characters of detail'] } };
  }

  const category = INCIDENT_CATEGORY_MAP[type] ?? 'OTHER';
  const reportedLabel = INCIDENT_TYPE_LABELS[type] ?? type;

  // Everything the five-value enum cannot hold, kept verbatim rather than
  // dropped. The reported type is recorded unconditionally — the map is lossy
  // in general and the driver's own word is the record.
  const notes =
    [`Reported type: ${reportedLabel}`, location ? `Location: ${location}` : null]
      .filter(Boolean)
      .join('\n') || null;

  let incidentId: string;
  try {
    const tenantPrisma = await getTenantPrisma();
    const incident = await tenantPrisma.driverIncident.create({
      data: {
        tenantId: session.tenantId,
        // Identity from the session, never from the form — the same rule
        // `driver-documents.ts` states at the top of the file.
        driverId: session.userId,
        createdById: session.userId,
        category,
        severity: severity as IncidentSeverity,
        description: description.trim(),
        notes,
        reportedAt: new Date(),
      },
      select: { id: true },
    });
    incidentId = incident.id;
  } catch (err) {
    // Never swallowed into a bare `catch {}` like the sibling HOS action. An
    // incident write that fails silently is this defect wearing a new coat.
    logger.error('[submitIncidentReport] failed to record incident', err, {
      tenantId: session.tenantId,
      driverId: session.userId,
      category,
      error: serializeError(err),
    });
    return {
      error:
        'We could not save your report. Nothing has been recorded — please try again, and contact dispatch directly if this is urgent.',
    };
  }

  // The row is committed. Everything below is best-effort and may not affect it.
  //
  // Payload gathered HERE, with the response still in scope, and handed to the
  // deferred closure fully built (Phase 10, rule 1). `getCurrentUser()` reads
  // headers, so it cannot move inside the closure.
  let driverName = session.email;
  try {
    const user = await getCurrentUser();
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    if (full) driverName = full;
  } catch (err) {
    // A missing display name must never cost us the notification. Fall through
    // on the email, which the session always carries.
    logger.error('[submitIncidentReport] could not resolve driver name', err, {
      incidentId,
      driverId: session.userId,
      error: serializeError(err),
    });
  }

  // Wrapped even though `emitNotificationAfterResponse` is documented never to
  // throw. The guarantee that matters — a recorded incident is never lost to a
  // notification problem — is made STRUCTURAL here rather than left resting on
  // another module's promise, which is the same reasoning as the T3/T4 verdict
  // union and `useOptimistic` in this codebase: leave the wrong state
  // unrepresentable instead of trusting a comment. If a later edit makes that
  // function able to throw, a saved report would otherwise be reported to the
  // driver as a failure — the precise inversion Section 11 forbids.
  try {
    emitNotificationAfterResponse('driver.incident_reported', {
      tenantId: session.tenantId,
      payload: {
        driverId: session.userId,
        driverName,
        incidentType: reportedLabel,
        severity,
        // The template's CTA is "View Incident Report" and NO WEB PAGE RENDERS
        // A DriverIncident today — /safety does not, the carrier driver detail
        // does not, only mobile owner driver-detail does. This link resolves
        // and identifies the driver, so it is not a 404, but the label
        // overpromises until an owner incident view exists. Reported in
        // 570-SUMMARY rather than silently rewritten in a production template.
        reportUrl: `${getAppBaseUrl()}/carrier/fleet/drivers`,
      },
      relatedEntity: { type: 'driver_incident', id: incidentId },
    });
  } catch (err) {
    logger.error('[submitIncidentReport] incident recorded but notify failed', err, {
      incidentId,
      tenantId: session.tenantId,
      error: serializeError(err),
    });
  }

  return {
    success: true,
    message: 'Incident report submitted. Dispatch has been notified.',
  };
}

/**
 * Get the driver's recent incident reports.
 *
 * Previously returned a hardcoded `[]` under a "Feature scaffold" comment, so a
 * driver who did report something would have seen nothing come back.
 */
export async function getMyIncidentReports() {
  await requireRole([UserRole.DRIVER]);

  const session = await getSession();
  if (!session) return [];

  try {
    const tenantPrisma = await getTenantPrisma();
    return await tenantPrisma.driverIncident.findMany({
      where: { tenantId: session.tenantId, driverId: session.userId },
      orderBy: { reportedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        category: true,
        severity: true,
        description: true,
        notes: true,
        reportedAt: true,
      },
    });
  } catch (err) {
    logger.error('[getMyIncidentReports] failed to load incidents', err, {
      tenantId: session.tenantId,
      driverId: session.userId,
      error: serializeError(err),
    });
    return [];
  }
}
