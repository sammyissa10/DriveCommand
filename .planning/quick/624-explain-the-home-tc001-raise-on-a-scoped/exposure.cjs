// quick-624: which census rows depend on a SESSION-scope GUC set by a DIFFERENT pool checkout than their own?
const fs = require('fs');
const [, , censusPath] = process.argv;
const j = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
const rows = j.statements;
const tenantArm = (c) => /TENANT_(SESSION|ORG)|WITH_TENANT_RLS|CREATE_TENANT_CLIENT/.test(c);
const out = { totalStatements: rows.length, byVerdict: {}, exposed: 0, exposedFiles: new Set(), exposedByClient: {}, exposedByFailure: {},
  immune: { txSetsOwnGuc: 0, admin: 0, bypassFlagged: 0, noRlsOrRawNoTable: 0, gucPlumbing: 0, gatingAlready: 0 } };
for (const r of rows) {
  out.byVerdict[r.verdict] = (out.byVerdict[r.verdict] || 0) + 1;
  if (r.verdict !== 'SCOPED') {
    if (r.verdict === 'ADMIN_CONNECTION') out.immune.admin++;
    else if (r.verdict === 'GUC_PLUMBING') out.immune.gucPlumbing++;
    else if (/NO_RLS|RAW_NO_TABLE/.test(r.verdict)) out.immune.noRlsOrRawNoTable++;
    else out.immune.gatingAlready++;
    continue;
  }
  if (r.tenantGucInTx) { out.immune.txSetsOwnGuc++; continue; }
  if (r.bypassFlag && r.bypassFlagOnEveryArm) { out.immune.bypassFlagged++; continue; }
  if (!tenantArm(r.client)) continue;
  out.exposed++;
  out.exposedFiles.add(r.file);
  out.exposedByClient[r.client] = (out.exposedByClient[r.client] || 0) + 1;
  out.exposedByFailure[r.failure] = (out.exposedByFailure[r.failure] || 0) + 1;
}
out.exposedFiles = out.exposedFiles.size;
out.scopedNotCounted = out.byVerdict.SCOPED - out.exposed - out.immune.txSetsOwnGuc - out.immune.bypassFlagged;
console.log(JSON.stringify(out, null, 1));
