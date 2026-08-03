'use client';

/**
 * Import wizard — source selection and multi-page staging.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 4.1, screens 1
 * and 2. Extraction progress lives on `/carrier/imports/[id]`, because progress
 * has to survive a reload and a URL is the only thing that does.
 *
 * The order of `files` in this component's state is the page order. It is sent
 * as an ordered array of storage keys and stored as one — there is no separate
 * ordinal anywhere in the chain, which is what makes "the reorder reached the
 * extractor" true by construction rather than by testing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Camera,
  Clock,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ImportListItem } from '@/lib/document-import/intake';

// ---------------------------------------------------------------------------
// Staged files
// ---------------------------------------------------------------------------

interface StagedItem {
  /** Stable across reorders — dnd-kit needs an id that is not the index. */
  id: string;
  file: File;
  previewUrl: string | null;
  /** Set once uploaded. */
  storageKey?: string;
  error?: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,text/csv,.csv';
const MAX_BYTES = 25 * 1024 * 1024;

let seq = 0;
function stage(file: File): StagedItem {
  seq += 1;
  return {
    id: `staged-${seq}`,
    file,
    previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  };
}

function kindIcon(file: File) {
  if (file.type === 'application/pdf') return FileText;
  if (file.type.includes('csv')) return FileSpreadsheet;
  return Camera;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// One thumbnail row
// ---------------------------------------------------------------------------

function PageRow({
  item,
  index,
  disabled,
  onDelete,
  onRetake,
}: {
  item: StagedItem;
  index: number;
  disabled: boolean;
  onDelete: () => void;
  onRetake: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  const Icon = kindIcon(item.file);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-xl bg-muted/40 p-3',
        isDragging && 'opacity-60 ring-2 ring-primary',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder page ${index + 1}`}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
        {item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL, not a remote asset
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          Page {index + 1}
          <span className="ml-2 font-normal text-muted-foreground">{item.file.name}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatBytes(item.file.size)}
          {item.error ? <span className="ml-2 text-destructive">{item.error}</span> : null}
        </p>
      </div>

      <button
        type="button"
        onClick={onRetake}
        disabled={disabled}
        aria-label={`Retake page ${index + 1}`}
        title="Retake this page"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40"
      >
        <RefreshCw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`Remove page ${index + 1}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

interface DuplicateNotice {
  message: string;
  importId: string;
  createdTripId: string | null;
}

export function ImportWizard({ recent }: { recent: ImportListItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState<StagedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateNotice | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const retakeRef = useRef<HTMLInputElement>(null);
  const retakeIndex = useRef<number | null>(null);

  // Object URLs are a leak if they outlive the component.
  useEffect(
    () => () => {
      for (const i of items) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only, on unmount
    [],
  );

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList?.length) return;
    const next: StagedItem[] = [];
    let rejected: string | null = null;

    for (const f of Array.from(fileList)) {
      if (f.size > MAX_BYTES) {
        rejected = `"${f.name}" is larger than 25MB.`;
        continue;
      }
      next.push(stage(f));
    }

    setError(rejected);
    setDuplicate(null);
    if (next.length) setItems((prev) => [...prev, ...next]);
  }, []);

  function removeAt(index: number) {
    setItems((prev) => {
      const gone = prev[index];
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function startRetake(index: number) {
    retakeIndex.current = index;
    retakeRef.current?.click();
  }

  function applyRetake(fileList: FileList | null) {
    const index = retakeIndex.current;
    retakeIndex.current = null;
    const file = fileList?.[0];
    if (index === null || !file) return;
    setItems((prev) => {
      const copy = [...prev];
      const old = copy[index];
      if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);
      copy[index] = stage(file);
      return copy;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === active.id);
      const to = prev.findIndex((i) => i.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  }

  // -------------------------------------------------------------------------
  // Upload + create
  // -------------------------------------------------------------------------

  async function uploadOne(item: StagedItem): Promise<string> {
    const contentType = item.file.type || 'application/octet-stream';
    const grantRes = await fetch('/api/v1/carrier/document-imports/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: item.file.name,
        contentType,
        sizeBytes: item.file.size,
      }),
    });
    const grantJson = await grantRes.json().catch(() => ({}));
    if (!grantRes.ok) throw new Error(grantJson.error ?? 'Could not prepare the upload.');

    const { uploadUrl, storageKey } = grantJson.data as { uploadUrl: string; storageKey: string };

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: item.file,
    });
    if (!put.ok) throw new Error('The upload did not finish.');

    return storageKey;
  }

  async function submit(mode: 'new' | 'correction' = 'new') {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setDuplicate(null);
    setUploaded(0);

    try {
      const keys: string[] = [];
      for (const [i, item] of items.entries()) {
        try {
          // Already uploaded on a previous attempt — do not pay for it twice.
          const key = item.storageKey ?? (await uploadOne(item));
          keys.push(key);
          setItems((prev) => {
            const copy = [...prev];
            if (copy[i]) copy[i] = { ...copy[i], storageKey: key, error: undefined };
            return copy;
          });
          setUploaded(i + 1);
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Upload failed.';
          setItems((prev) => {
            const copy = [...prev];
            if (copy[i]) copy[i] = { ...copy[i], error: message };
            return copy;
          });
          throw new Error(
            `Page ${i + 1} did not upload. ${message} Nothing else was lost — press Read document to try again.`,
          );
        }
      }

      const res = await fetch('/api/v1/carrier/document-imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKeys: keys, mode }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && json.duplicate) {
        setDuplicate({
          message: json.error,
          importId: json.duplicate.importId,
          createdTripId: json.duplicate.createdTripId ?? null,
        });
        return;
      }
      if (!res.ok) throw new Error(json.error ?? 'Could not start the import.');

      router.push(`/carrier/imports/${json.data.importId}?start=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------

  const hasItems = items.length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Import document</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Photograph a manifest, or upload a PDF or CSV. Pages can be added in any order and
            arranged before it is read.
          </p>
        </div>
        <Link
          href="/carrier/trips"
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </Link>
      </div>

      {/* Hidden inputs behind the three source buttons */}
      <input
        ref={pickRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={retakeRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          applyRetake(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Screen 1 — source selection */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SourceButton
          icon={Camera}
          label="Take photos"
          hint="One per page"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
        />
        <SourceButton
          icon={Upload}
          label="Upload file"
          hint="PDF, photos or CSV"
          onClick={() => pickRef.current?.click()}
          disabled={busy}
        />
        <SourceButton
          icon={Clock}
          label="Choose recent"
          hint={recent.length ? `${recent.length} recent` : 'Nothing yet'}
          onClick={() => setShowRecent((v) => !v)}
          disabled={busy || recent.length === 0}
          active={showRecent}
        />
      </div>

      {showRecent && recent.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-muted/40">
          {recent.map((r) => (
            <li key={r.id}>
              <Link
                href={`/carrier/imports/${r.id}`}
                className="flex min-h-[56px] items-center gap-3 px-4 py-3 hover:bg-muted"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {r.originalName ?? 'Untitled document'}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.consignmentCount != null ? `${r.consignmentCount} stops · ` : ''}
                  {r.status.replace(/_/g, ' ').toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Screen 2 — staging */}
      {hasItems ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {items.length} page{items.length === 1 ? '' : 's'}
            </h2>
            <span className="text-xs text-muted-foreground">Drag to reorder</span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {items.map((item, index) => (
                  <PageRow
                    key={item.id}
                    item={item}
                    index={index}
                    disabled={busy}
                    onDelete={() => removeAt(index)}
                    onRetake={() => startRetake(index)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => pickRef.current?.click()}
          >
            Add more pages
          </Button>
        </div>
      ) : null}

      {/* Inline notices — never a modal, per spec Section 15 */}
      {error ? (
        <div className="flex items-start gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {duplicate ? (
        <div className="space-y-3 rounded-xl bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">{duplicate.message}</p>
              <p className="mt-1 text-muted-foreground">
                Open what is already there, or import this again as a correction — the earlier
                import steps aside and this one takes its place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link
                href={
                  duplicate.createdTripId
                    ? `/carrier/trips/${duplicate.createdTripId}`
                    : `/carrier/imports/${duplicate.importId}`
                }
              >
                {duplicate.createdTripId ? 'Open the trip' : 'Open the existing import'}
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => submit('correction')} disabled={busy}>
              Import as a correction
            </Button>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Uploading page {Math.min(uploaded + 1, items.length)} of {items.length}
          </p>
          <Progress value={(uploaded / Math.max(items.length, 1)) * 100} />
        </div>
      ) : null}

      <Button
        className="h-12 w-full text-base"
        disabled={!hasItems || busy}
        onClick={() => submit('new')}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Read document
      </Button>
    </div>
  );
}

function SourceButton({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  active,
}: {
  icon: typeof Camera;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-xl bg-muted/40 p-4 text-center transition hover:bg-muted disabled:opacity-40',
        active && 'ring-2 ring-primary',
      )}
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
