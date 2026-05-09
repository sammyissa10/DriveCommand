/**
 * Script to generate OpenAPI 3.1 spec from Zod schemas.
 *
 * Usage: cd apps/web && npx tsx scripts/generate-openapi.ts
 * Output: apps/web/public/openapi.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function main() {
  const { generateOpenApiDocument } = await import('../src/lib/openapi/index.js');
  const spec = generateOpenApiDocument();

  const publicDir = join(process.cwd(), 'public');
  mkdirSync(publicDir, { recursive: true });

  const outputPath = join(publicDir, 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');

  console.log(`OpenAPI spec written to: ${outputPath}`);
  console.log(`Paths: ${Object.keys(spec.paths ?? {}).length}`);
  console.log(`Schemas: ${Object.keys(spec.components?.schemas ?? {}).length}`);
}

main().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
