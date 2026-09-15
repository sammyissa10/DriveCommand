/**
 * Environment bootstrap for terminal scripts - THE WRITER DOOR, and the default.
 *
 * Import this FIRST, before any module that touches Prisma or the Anthropic client:
 *
 *   import './_bootstrap-env';
 *   import { ... } from '../src/lib/...';
 *
 * Import statements execute in source order, and `lib/db/prisma.ts` builds its
 * `pg.Pool` at module scope - so the environment has to be correct before that
 * import line runs, not merely before `main()` does.
 *
 * WHAT THIS DOOR MEANS. A script importing this module is treated as a WRITER. It
 * will REFUSE to run when it resolves the production project, unless the operator
 * passes `--allow-production` (or sets `ALLOW_PRODUCTION_WRITES=1`).
 *
 * A script that only READS should import `./_bootstrap-env-readonly` instead;
 * read-only scripts may target production freely.
 *
 * THE DEFAULT POINTS THIS WAY ON PURPOSE. A new script that thinks about none of
 * this gets the safe answer. Were the default reversed - writers opting in - then
 * forgetting would mean a silent production write, and nothing downstream could
 * distinguish "declared read-only" from "never considered it".
 *
 * WHICH DATABASE. Resolution is `_db-target.ts`'s five-rung ladder, and the
 * resolved project ref is PRINTED TO STDERR on every run. Until quick-607 this
 * file ended with an unconditional `DATABASE_URL = DIRECT_URL`, and since every
 * env file points DIRECT_URL at production, every script that imported it read
 * production no matter what the operator pinned - and said nothing about it.
 */

import { bootstrapScriptEnv } from './_bootstrap-core';

bootstrapScriptEnv('writes');
