/**
 * Grid Views API - GET /api/user/grid-views/[gridId] (list) and POST (create).
 *
 * Personal views per user (not tenant-scoped).
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import type { GridViewState } from '@/components/data-grid/core/types';

// ---------------------------------------------------------------------------
// GET - List views for grid + user
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gridId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gridId } = await params;
    const userId = session.userId;

    const views = await prisma.gridView.findMany({
      where: {
        gridId,
        userId,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(views);
  } catch (error) {
    console.error('Failed to fetch grid views:', error);
    return NextResponse.json(
      { error: 'Failed to fetch views' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST - Create new view
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gridId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gridId } = await params;
    const userId = session.userId;
    const body = await request.json();

    const { name, isDefault, state } = body as {
      name: string;
      isDefault?: boolean;
      state: GridViewState;
    };

    // Validate input
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'View name is required' },
        { status: 400 }
      );
    }

    if (!state) {
      return NextResponse.json(
        { error: 'View state is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = await prisma.gridView.findUnique({
      where: {
        gridId_userId_name: {
          gridId,
          userId,
          name: name.trim(),
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A view with this name already exists' },
        { status: 409 }
      );
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.gridView.updateMany({
        where: {
          gridId,
          userId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Create view
    const view = await prisma.gridView.create({
      data: {
        gridId,
        userId,
        name: name.trim(),
        isDefault: isDefault ?? false,
        state: state as unknown as Record<string, unknown>,
        schemaVersion: 1,
      },
    });

    return NextResponse.json(view);
  } catch (error) {
    console.error('Failed to create grid view:', error);
    return NextResponse.json(
      { error: 'Failed to create view' },
      { status: 500 }
    );
  }
}
