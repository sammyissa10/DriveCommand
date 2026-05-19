/**
 * API route for user grid preferences.
 *
 * GET /api/user/grid-preferences/[gridId]
 *   Returns the user's saved preferences for a specific grid.
 *   Returns 401 if not authenticated, 404 if no preferences exist.
 *
 * PUT /api/user/grid-preferences/[gridId]
 *   Creates or updates the user's preferences for a specific grid.
 *   Returns 401 if not authenticated, 400 for invalid input.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';

// ---------------------------------------------------------------------------
// Validation Schema
// ---------------------------------------------------------------------------

const gridPreferencesSchema = z.object({
  columnOrder: z.array(z.string()).optional(),
  columnWidths: z.record(z.string(), z.number()).optional(),
  hiddenColumns: z.array(z.string()).optional(),
  frozenColumns: z.array(z.string()).optional(),
  density: z.enum(['compact', 'normal', 'comfortable']).optional(),
  pageSize: z.number().int().min(5).max(100).optional(),
});

type GridPreferencesInput = z.infer<typeof gridPreferencesSchema>;

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ gridId: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { gridId } = await params;

  const preference = await prisma.gridPreference.findUnique({
    where: {
      userId_gridId: {
        userId: session.userId,
        gridId,
      },
    },
  });

  if (!preference) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    columnOrder: preference.columnOrder,
    columnWidths: preference.columnWidths as Record<string, number>,
    hiddenColumns: preference.hiddenColumns,
    frozenColumns: preference.frozenColumns,
    density: preference.density,
    pageSize: preference.pageSize,
    updatedAt: preference.updatedAt.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// PUT Handler
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ gridId: string }> }
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { gridId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = gridPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input: GridPreferencesInput = parsed.data;

  // Build update data, only including fields that were provided
  const updateData: {
    columnOrder?: string[];
    columnWidths?: Record<string, number>;
    hiddenColumns?: string[];
    frozenColumns?: string[];
    density?: string;
    pageSize?: number;
  } = {};

  if (input.columnOrder !== undefined) updateData.columnOrder = input.columnOrder;
  if (input.columnWidths !== undefined) updateData.columnWidths = input.columnWidths;
  if (input.hiddenColumns !== undefined) updateData.hiddenColumns = input.hiddenColumns;
  if (input.frozenColumns !== undefined) updateData.frozenColumns = input.frozenColumns;
  if (input.density !== undefined) updateData.density = input.density;
  if (input.pageSize !== undefined) updateData.pageSize = input.pageSize;

  const preference = await prisma.gridPreference.upsert({
    where: {
      userId_gridId: {
        userId: session.userId,
        gridId,
      },
    },
    create: {
      userId: session.userId,
      gridId,
      ...updateData,
    },
    update: updateData,
  });

  return NextResponse.json({
    columnOrder: preference.columnOrder,
    columnWidths: preference.columnWidths as Record<string, number>,
    hiddenColumns: preference.hiddenColumns,
    frozenColumns: preference.frozenColumns,
    density: preference.density,
    pageSize: preference.pageSize,
    updatedAt: preference.updatedAt.toISOString(),
  });
}
