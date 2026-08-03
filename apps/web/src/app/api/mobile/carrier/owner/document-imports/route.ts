/**
 * GET  /api/mobile/carrier/owner/document-imports?scope=resumable|recent
 * POST /api/mobile/carrier/owner/document-imports
 *
 * Bearer-token mirror of `/api/v1/carrier/document-imports`. Both call the same
 * handlers — the only difference is how the caller is identified.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withMobileAuth } from '@/lib/api/with-mobile-auth';
import { handleCreateImport, handleListImports } from '@/lib/document-import/handlers';

export const GET = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const scope = req.nextUrl.searchParams.get('scope');
    const { status, body } = await handleListImports(auth.tenantId, auth.userId, scope);
    return NextResponse.json(body, { status });
  },
  { allowedRoles: ['OWNER'] },
);

export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const body = await req.json();
    const result = await handleCreateImport(auth.tenantId, auth.userId, body);
    return NextResponse.json(result.body, { status: result.status });
  },
  { allowedRoles: ['OWNER'] },
);
