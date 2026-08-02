import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { extractDocument } from "../src/lib/document-import/service";

const FOLDER = "C:/Users/sammy/Desktop/manifest";
const TENANT_ID = "7e9eca25-1f97-46ed-9365-e67be49436d5";

async function main() {
  const files = readdirSync(FOLDER)
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort();

  const sources = files.map((filename, i) => ({
    ordinal: i + 1,
    filename,
    mimeType: "image/jpeg",
    bytes: readFileSync(join(FOLDER, filename)),
  }));

  console.log(`Extracting ${sources.length} pages...`);
  const result = await extractDocument({ tenantId: TENANT_ID, sources });

  if (!("consignments" in (result as any)) && "code" in (result as any)) {
    console.log("FAILED:", JSON.stringify(result, null, 2));
    return;
  }

  const r = result as any;
  console.log(`\nDocument type: ${r.documentType ?? r.extraction?.documentType}`);
  const consignments = r.consignments ?? r.extraction?.consignments ?? [];
  console.log(`Consignments: ${consignments.length}\n`);
  for (const c of consignments) {
    console.log(`${c.externalCode ?? "no-code"}  ${c.name}  pages ${JSON.stringify(c.pageNumbers)}`);
    console.log(`  qty: ${JSON.stringify(c.totals)}`);
    console.log(`  confidences: ${JSON.stringify(c.fieldConfidence)}\n`);
  }
  console.log("Warnings:", JSON.stringify(r.extractionWarnings ?? r.extraction?.extractionWarnings ?? []));
  console.log("Usage:", JSON.stringify(r.usage ?? {}));
}

main().catch((e) => console.error("ERROR:", e));