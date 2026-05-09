import { NextResponse } from 'next/server';
import { isSystemAdmin } from '@/lib/auth/supabase';
import { buildAdminSearchIndex } from '@/lib/docs/build-admin-search-index';
import fs from 'node:fs';
import path from 'node:path';

const INDEX_PATH = path.join(process.cwd(), '.docs-data/admin-docs-search-index.json');

export async function GET() {
  // Gate: only system admins can access search index
  const admin = await isSystemAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Try to read pre-built index from disk
  let index;
  if (fs.existsSync(INDEX_PATH)) {
    const fileContent = fs.readFileSync(INDEX_PATH, 'utf-8');
    index = JSON.parse(fileContent);
  } else {
    // Fallback: build index dynamically
    console.warn('Admin search index not found, building dynamically');
    index = buildAdminSearchIndex();
  }

  return NextResponse.json(index);
}
