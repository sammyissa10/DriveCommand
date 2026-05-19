/**
 * Grid View API - PUT and DELETE for individual view.
 *
 * Personal views per user (not tenant-scoped).
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import type { GridViewState } from '@/components/data-grid/core/types';
import type { Prisma } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// PUT - Update view
// ---------------------------------------------------------------------------

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ gridId: string; viewId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gridId, viewId } = await params;
    const userId = session.userId;
    const body = await request.json();

    const { name, isDefault, state } = body as {
      name?: string;
      isDefault?: boolean;
      state?: GridViewState;
    };

    // Verify ownership
    const existing = await prisma.gridView.findUnique({
      where: { id: viewId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    if (existing.userId !== userId || existing.gridId !== gridId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // If updating name, check for duplicates
    if (name && name.trim() !== existing.name) {
      const duplicate = await prisma.gridView.findUnique({
        where: {
          gridId_userId_name: {
            gridId,
            userId,
            name: name.trim(),
          },
        },
      });

      if (duplicate && duplicate.id !== viewId) {
        return NextResponse.json(
          { error: 'A view with this name already exists' },
          { status: 409 }
        );
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.gridView.updateMany({
        where: {
          gridId,
          userId,
          isDefault: true,
          id: { not: viewId },
        },
        data: {
          isDefault: false,
        },
      });
    }

    // Update view
    const updated = await prisma.gridView.update({
      where: { id: viewId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(isDefault !== undefined && { isDefault }),
        ...(state !== undefined && { state: state as unknown as Prisma.InputJsonValue }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update grid view:', error);
    return NextResponse.json(
      { error: 'Failed to update view' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE - Delete view
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ gridId: string; viewId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gridId, viewId } = await params;
    const userId = session.userId;

    // Verify ownership
    const existing = await prisma.gridView.findUnique({
      where: { id: viewId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    if (existing.userId !== userId || existing.gridId !== gridId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete view
    await prisma.gridView.delete({
      where: { id: viewId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete grid view:', error);
    return NextResponse.json(
      { error: 'Failed to delete view' },
      { status: 500 }
    );
  }
}
