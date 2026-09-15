/**
 * Environment bootstrap for terminal scripts - THE READ-ONLY DOOR.
 *
 *   import './_bootstrap-env-readonly';
 *   import { ... } from '../src/lib/...';
 *
 * Identical to `./_bootstrap-env` in every respect but one: a script importing
 * this module declares that it does not write, and is therefore allowed to target
 * the production project freely. `audit:rls-policy-drift` and
 * `audit:app-user-harness` both exist to measure production; refusing them there
 * would break the thing they are for.
 *
 * IMPORTING THIS IS A CLAIM, and the claim is checked by a human at review time,
 * not by the runtime - nothing here can prove a script issues no writes. Two
 * things keep that honest:
 *
 *   1. The census in `tests/security/script-db-target-guard.test.ts` pins exactly
 *      which files import this door, so moving a script onto it is a reviewable
 *      one-line diff rather than an invisible change of posture.
 *   2. The DEFAULT is the other door. Nothing arrives here by accident.
 *
 * "Read-only" here admits DML that is provably discarded - `app-user-connection-harness.ts`
 * runs its probes inside `BEGIN`/`ROLLBACK` and contains no commit statement
 * anywhere. That is a deliberate reading, recorded so the next reader does not
 * take the harness as a counter-example to the rule.
 */

import { bootstrapScriptEnv } from './_bootstrap-core';

bootstrapScriptEnv('read-only');
