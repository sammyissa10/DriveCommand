# quick-606 · 09 — `606-report-integrity.test.ts`, witnessed RED

Green baseline: **9 passed (9)**. `tests/security/604-report-integrity.test.ts` is **untouched** —
its inputs are a closed task's evidence.

## The RED

`02-classification.json`'s `TRIPWIRE_TC001` decremented 7 → 6 and `categorySum` 11 → 10.

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/security/606-report-integrity.test.ts > … > BEFORE: the category sum equals the independently derived failure count
AssertionError: expected 10 to be 11 // Object.is equality

- Expected
+ Received

- 11
+ 10

 ❯ tests/security/606-report-integrity.test.ts:78:17

 FAIL  tests/security/606-report-integrity.test.ts > … > BEFORE is NON-TRIVIAL — without this, 0 === 0 would pass over an empty corpus
AssertionError: expected 6 to be greater than or equal to 7
 ❯ tests/security/606-report-integrity.test.ts:88:48
```

**Two tests fired, not one.** The sum check caught the arithmetic; the non-triviality floor caught it
independently. That second assertion is the one that matters here, because **the AFTER
classification's sum is 0** and `0 === 0` is satisfied by an empty corpus. Without a non-trivial
BEFORE pinned in the same file, this whole test could be made green by deleting every finding — the
quick-549 shape, where a bad slice fails GREEN.

Reverted; re-run **9 passed (9)**.

## What else the file asserts, and why

| assertion | the failure it exists to catch |
|---|---|
| both artefacts carry the SAME fifteen ids AND routes | an AFTER file that quietly dropped a failing row |
| the verdicts PARTITION the rows (sum of buckets === row count) | `LATENT`/`NOT_MEASURED` being folded into `pass`, or a row counted twice |
| every `LATENT`/`NOT_MEASURED` row carries a reason > 30 chars | a verdict with no explanation |
| a `LATENT` reason contains `= 0 on staging` and its gate reads 0 | a generic sentence that satisfies a length floor and says nothing |
| a `NOT_MEASURED` row has `status: null` and says "no request issued" | a request that WAS issued being labelled unmeasured |
| `entriesConsidered === 15` on the AFTER classification | a zero sum taken over zero input |
| no AFTER row is `fail` | the task's actual claim, asserted rather than asserted in prose |
| at least 4 BEFORE rows DISAGREE with quick-604's verdict | the re-verification being a restatement of the old table rather than a re-measurement |
