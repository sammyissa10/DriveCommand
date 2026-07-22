'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContactInput } from '@/lib/carrier/client-contacts';

let nextRowId = 0;
function newRowId(): string {
  nextRowId += 1;
  return `new-${Date.now()}-${nextRowId}`;
}

export interface ContactRow extends ContactInput {
  /** Local-only key for React list rendering; never sent to the API. */
  _rowId: string;
}

/** Converts server/initial contacts into rows carrying a stable local key. */
export function toContactRows(contacts: ContactInput[] | undefined | null): ContactRow[] {
  return (contacts ?? []).map((c) => ({ ...c, _rowId: c.id ?? newRowId() }));
}

/** Strips the local-only `_rowId` before submitting to the API. */
export function fromContactRows(rows: ContactRow[]): ContactInput[] {
  return rows.map(({ _rowId: _drop, ...c }) => c);
}

/**
 * Reusable add/remove contacts editor for a carrier client — one row per
 * contact (name, role, phone, email) with a radio group across rows binding
 * `isMain` (selecting one clears the others). Zero contacts is allowed.
 * Shared by the desktop ClientForm and the mobile create/detail screens.
 */
export function ContactsEditor({
  rows,
  onChange,
}: {
  rows: ContactRow[];
  onChange: (rows: ContactRow[]) => void;
}) {
  function addRow() {
    const row: ContactRow = {
      _rowId: newRowId(),
      name: '',
      role: '',
      phone: '',
      email: '',
      isMain: rows.length === 0,
    };
    onChange([...rows, row]);
  }

  function removeRow(rowId: string) {
    const next = rows.filter((r) => r._rowId !== rowId);
    // If the removed row was main and others remain, promote the first.
    if (next.length > 0 && !next.some((r) => r.isMain)) {
      next[0] = { ...next[0], isMain: true };
    }
    onChange(next);
  }

  function updateRow(rowId: string, patch: Partial<ContactRow>) {
    onChange(rows.map((r) => (r._rowId === rowId ? { ...r, ...patch } : r)));
  }

  function setMain(rowId: string) {
    onChange(rows.map((r) => ({ ...r, isMain: r._rowId === rowId })));
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contacts added yet. Add one for billing, dispatch, or AP.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row._rowId}
              className="rounded-lg border border-border bg-muted/20 p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="radio"
                    name="mainContact"
                    checked={row.isMain}
                    onChange={() => setMain(row._rowId)}
                    className="h-4 w-4 accent-primary"
                    aria-label={`Set ${row.name || 'this contact'} as main contact`}
                  />
                  Main contact
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(row._rowId)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Name</label>
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row._rowId, { name: e.target.value })}
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Role / Title</label>
                  <Input
                    value={row.role ?? ''}
                    onChange={(e) => updateRow(row._rowId, { role: e.target.value })}
                    placeholder="Billing, Dispatch, AP..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Phone</label>
                  <Input
                    value={row.phone ?? ''}
                    onChange={(e) => updateRow(row._rowId, { phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Email</label>
                  <Input
                    type="email"
                    value={row.email ?? ''}
                    onChange={(e) => updateRow(row._rowId, { email: e.target.value })}
                    placeholder="name@client.com"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add contact
      </Button>
    </div>
  );
}
