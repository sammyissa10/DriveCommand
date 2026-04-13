'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { LifeBuoy, X, Paperclip, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { createSupportTicket, uploadSupportScreenshot } from '@/actions/support-tickets';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';

const TICKET_CATEGORIES = [
  { value: 'BILLING', label: 'Billing' },
  { value: 'BUG', label: 'Bug Report' },
  { value: 'FEATURE', label: 'Feature Request' },
  { value: 'GENERAL', label: 'General' },
];

const TICKET_PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const SUPPORT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Draggable FAB ────────────────────────────────────────────────────────────

const FAB_SIZE = 48;             // h-12 w-12
const FAB_MARGIN = 24;           // distance from edges (desktop)
const FAB_MARGIN_BOTTOM_MOBILE = 80; // clears mobile bottom-nav bar (~h-16)
const FAB_DRAG_THRESHOLD = 5;    // px before a press becomes a drag
const FAB_LS_KEY = 'support-fab-corner';

type FabCorner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

const FAB_VALID_CORNERS: FabCorner[] = [
  'bottom-left', 'bottom-right', 'top-left', 'top-right',
];

function fabNearestCorner(btnLeft: number, btnTop: number): FabCorner {
  const cx = btnLeft + FAB_SIZE / 2;
  const cy = btnTop + FAB_SIZE / 2;
  const isLeft = cx < window.innerWidth / 2;
  const isTop = cy < window.innerHeight / 2;
  if (isTop && isLeft) return 'top-left';
  if (isTop && !isLeft) return 'top-right';
  if (!isTop && isLeft) return 'bottom-left';
  return 'bottom-right';
}

function fabCornerToPos(corner: FabCorner): { x: number; y: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Use a larger bottom margin on mobile to clear the bottom navigation bar.
  const bm = w < 1024 ? FAB_MARGIN_BOTTOM_MOBILE : FAB_MARGIN;
  switch (corner) {
    case 'top-left':     return { x: FAB_MARGIN, y: FAB_MARGIN };
    case 'top-right':    return { x: w - FAB_SIZE - FAB_MARGIN, y: FAB_MARGIN };
    case 'bottom-left':  return { x: FAB_MARGIN, y: h - FAB_SIZE - bm };
    case 'bottom-right': return { x: w - FAB_SIZE - FAB_MARGIN, y: h - FAB_SIZE - bm };
  }
}

interface SupportFABProps {
  onOpen: () => void;
}

/**
 * Floating action button that can be dragged to any corner of the screen.
 * Uses direct DOM manipulation during drag to avoid React re-renders.
 * Position is persisted in localStorage.
 */
function SupportFAB({ onOpen }: SupportFABProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  // Stored in a ref so drag handlers always read the current corner without
  // needing a React state cycle.
  const cornerRef = useRef<FabCorner>('bottom-left');

  // Tracks the active drag gesture.
  const dragStateRef = useRef<{
    startPointerX: number;
    startPointerY: number;
    startBtnX: number;
    startBtnY: number;
    hasDragged: boolean;
  } | null>(null);

  // After a drag ends the browser may still fire a synthetic `click` event.
  // We suppress exactly one click to avoid opening the modal.
  const suppressNextClickRef = useRef(false);

  // ── Mount: position from localStorage ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(FAB_LS_KEY) as FabCorner | null;
    const corner: FabCorner =
      saved && FAB_VALID_CORNERS.includes(saved) ? saved : 'bottom-left';
    cornerRef.current = corner;
    const pos = fabCornerToPos(corner);
    const btn = btnRef.current;
    if (btn) {
      btn.style.left = `${pos.x}px`;
      btn.style.top = `${pos.y}px`;
      btn.style.visibility = 'visible';
    }
  }, []);

  // ── Re-snap when the viewport is resized ───────────────────────────────────
  useEffect(() => {
    function onResize() {
      const pos = fabCornerToPos(cornerRef.current);
      const btn = btnRef.current;
      if (btn) {
        btn.style.transition = 'none';
        btn.style.left = `${pos.x}px`;
        btn.style.top = `${pos.y}px`;
      }
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Pointer handlers ────────────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    // Only handle left-click on mouse; accept all touch/pen events.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Capture so we receive pointermove/up even outside the element.
    e.currentTarget.setPointerCapture(e.pointerId);
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    dragStateRef.current = {
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startBtnX: rect.left,
      startBtnY: rect.top,
      hasDragged: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const ds = dragStateRef.current;
    if (!ds) return;
    const btn = btnRef.current;
    if (!btn) return;

    const dx = e.clientX - ds.startPointerX;
    const dy = e.clientY - ds.startPointerY;

    // Ignore tiny movements so a tap doesn't accidentally become a drag.
    if (!ds.hasDragged && Math.hypot(dx, dy) < FAB_DRAG_THRESHOLD) return;

    if (!ds.hasDragged) {
      ds.hasDragged = true;
      btn.style.cursor = 'grabbing';
    }

    // Constrain to the visible viewport.
    const maxX = window.innerWidth - FAB_SIZE;
    const maxY = window.innerHeight - FAB_SIZE;
    const newX = Math.max(0, Math.min(maxX, ds.startBtnX + dx));
    const newY = Math.max(0, Math.min(maxY, ds.startBtnY + dy));

    // Disable CSS transition so movement is instant during drag.
    btn.style.transition = 'none';
    btn.style.left = `${newX}px`;
    btn.style.top = `${newY}px`;
  }

  function handlePointerUp() {
    const ds = dragStateRef.current;
    if (!ds) return;
    dragStateRef.current = null;

    const btn = btnRef.current;
    if (!btn) return;
    btn.style.cursor = '';

    if (!ds.hasDragged) {
      // Short press — let the natural `click` event open the modal.
      return;
    }

    // ── Snap to nearest corner ──────────────────────────────────────────────
    const rect = btn.getBoundingClientRect();
    const corner = fabNearestCorner(rect.left, rect.top);
    cornerRef.current = corner;
    try { localStorage.setItem(FAB_LS_KEY, corner); } catch { /* ignore quota errors */ }

    const pos = fabCornerToPos(corner);
    btn.style.transition = 'left 200ms ease-out, top 200ms ease-out';
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;

    // After a real drag, the browser sometimes fires a residual `click` event.
    // Suppress exactly one to prevent accidentally opening the modal.
    suppressNextClickRef.current = true;
  }

  function handlePointerCancel() {
    if (!dragStateRef.current) return;
    dragStateRef.current = null;
    const btn = btnRef.current;
    if (!btn) return;
    btn.style.cursor = '';
    // Snap back to the last committed corner.
    const pos = fabCornerToPos(cornerRef.current);
    btn.style.transition = 'left 200ms ease-out, top 200ms ease-out';
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;
  }

  function handleClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onOpen();
  }

  return (
    <button
      ref={btnRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      // `visibility: hidden` until the useEffect positions it (avoids flash at 0,0).
      // `touchAction: none` prevents the browser hijacking the gesture for scroll.
      // React won't reset these inline styles on re-render because the `style` prop
      // object values are unchanged across renders, so React skips the DOM update.
      style={{ top: 0, left: 0, visibility: 'hidden', touchAction: 'none' }}
      className="fixed z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg hover:from-blue-600 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 select-none cursor-grab"
      aria-label="Open support"
      title="Get support"
    >
      <LifeBuoy className="h-5 w-5" />
    </button>
  );
}

// ─── SupportTicketModal ───────────────────────────────────────────────────────

export function SupportTicketModal() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('GENERAL');
  const [priority, setPriority] = useState('NORMAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<'MOBILE' | 'DESKTOP'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'MOBILE' : 'DESKTOP'
  );
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Screenshot capture state
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Only render for authenticated users
  if (!user) return null;

  function resetForm() {
    setCategory('GENERAL');
    setPriority('NORMAL');
    setTitle('');
    setDescription('');
    setPlatform(typeof window !== 'undefined' && window.innerWidth < 768 ? 'MOBILE' : 'DESKTOP');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Clear screenshot
    setScreenshotBlob(null);
    if (screenshotPreviewUrl) {
      URL.revokeObjectURL(screenshotPreviewUrl);
    }
    setScreenshotPreviewUrl(null);
  }

  function clearScreenshot() {
    setScreenshotBlob(null);
    if (screenshotPreviewUrl) {
      URL.revokeObjectURL(screenshotPreviewUrl);
    }
    setScreenshotPreviewUrl(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }

    // Validate type
    if (!selected.type.startsWith('image/') && selected.type !== 'application/pdf') {
      toast.error('Only images and PDFs are accepted');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate size
    if (selected.size > SUPPORT_MAX_FILE_SIZE) {
      toast.error('File must be under 10MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function captureAndOpen() {
    setShowConfirmDialog(false);
    setCapturing(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 1,
        logging: false,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });
      await new Promise<void>((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              setScreenshotBlob(blob);
              setScreenshotPreviewUrl(URL.createObjectURL(blob));
            }
            resolve();
          },
          'image/png',
          0.8
        );
      });
    } catch (err) {
      logger.error('[SupportTicketModal] Screenshot capture failed:', err);
      toast.error('Screenshot capture failed — you can still submit without one.');
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  }

  function skipAndOpen() {
    setShowConfirmDialog(false);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (title.trim().length < 3) {
      toast.error('Title must be at least 3 characters');
      return;
    }
    if (description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }

    let attachmentKey: string | undefined;
    let screenshotS3Key: string | undefined;

    // Upload manual attachment if selected
    if (file) {
      setUploading(true);
      try {
        const uploadRes = await fetch('/api/support/upload-attachment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: 'Upload failed' }));
          toast.error(err.error ?? 'Failed to get upload URL');
          setUploading(false);
          return;
        }

        const { uploadUrl, s3Key } = await uploadRes.json();

        // PUT the file directly to S3
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!putRes.ok) {
          toast.error('Failed to upload attachment. Please try again.');
          setUploading(false);
          return;
        }

        attachmentKey = s3Key;
      } catch {
        toast.error('Failed to upload attachment. Please try again.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    // Upload auto-captured screenshot server-side (avoids browser→R2 CORS issues)
    if (screenshotBlob) {
      setUploading(true);
      try {
        const ssFormData = new FormData();
        ssFormData.append('screenshot', new File([screenshotBlob], 'screenshot.png', { type: 'image/png' }));
        const result = await uploadSupportScreenshot(ssFormData);
        if ('s3Key' in result) {
          screenshotS3Key = result.s3Key;
        } else {
          logger.error('[SupportTicketModal] Screenshot upload failed:', result.error);
        }
      } catch (err) {
        logger.error('[SupportTicketModal] Screenshot upload error:', err);
      }
      setUploading(false);
    }

    setLoading(true);
    try {
      const result = await createSupportTicket({
        category,
        priority,
        title: title.trim(),
        description: description.trim(),
        fromPage: pathname,
        platform,
        attachmentKey,
        screenshotKey: screenshotS3Key,
      });

      if (result.success) {
        toast.success(`Ticket ${result.ticketNumber} submitted! We'll be in touch soon.`);
        setOpen(false);
        resetForm();
      } else {
        toast.error(result.error ?? 'Failed to submit ticket');
      }
    } catch {
      toast.error('Failed to submit ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = loading || uploading;

  return (
    <>
      {/* Draggable support FAB */}
      <SupportFAB onOpen={() => setShowConfirmDialog(true)} />

      {/* Screenshot confirmation dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-blue-500" />
              Capture Screenshot?
            </AlertDialogTitle>
            <AlertDialogDescription>
              We can capture a screenshot of the current page to attach to your support ticket.
              This helps our team understand the issue faster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={skipAndOpen}>Skip</AlertDialogCancel>
            <AlertDialogAction onClick={captureAndOpen}>
              Capture &amp; Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Capturing overlay */}
      {capturing && (
        <div data-html2canvas-ignore className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div data-html2canvas-ignore className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <span className="text-sm font-medium text-gray-700">Capturing screenshot...</span>
          </div>
        </div>
      )}

      {/* Support sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-blue-500" />
              Submit Support Ticket
            </SheetTitle>
            <SheetDescription>
              Describe your issue or request and our team will get back to you.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Ticket Category */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Category
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ticket Priority */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Priority
              </label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Select priority..." />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Platform toggle */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Platform
              </label>
              <div className="flex rounded-md overflow-hidden border border-input">
                <button
                  type="button"
                  onClick={() => setPlatform('MOBILE')}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                    platform === 'MOBILE'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Mobile
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform('DESKTOP')}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                    platform === 'DESKTOP'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  Desktop
                </button>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label htmlFor="support-title" className="text-sm font-medium text-foreground">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                id="support-title"
                placeholder="Brief summary of the issue..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="support-description" className="text-sm font-medium text-foreground">
                Description <span className="text-destructive">*</span>
              </label>
              <textarea
                id="support-description"
                placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behavior, screenshots if possible..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={2000}
                required
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {description.length}/2000
              </p>
            </div>

            {/* Auto-captured screenshot preview */}
            {screenshotPreviewUrl && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-blue-500" />
                  Auto-captured Screenshot
                </label>
                <div className="relative inline-block">
                  <img
                    src={screenshotPreviewUrl}
                    alt="Page screenshot preview"
                    className="max-h-32 rounded-md border border-input object-contain"
                  />
                  <button
                    type="button"
                    onClick={clearScreenshot}
                    disabled={isDisabled}
                    className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80 transition-colors disabled:opacity-50"
                    aria-label="Remove screenshot"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* File attachment */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Attachment <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={clearFile}
                    disabled={isDisabled}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  disabled={isDisabled}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-muted-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground cursor-pointer disabled:opacity-50"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Images or PDF only, max 10MB
              </p>
            </div>

            {/* Current page (auto-populated info) */}
            <div className="rounded-md bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Submitting from:</span> {pathname}
              </p>
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { setOpen(false); resetForm(); }}
                disabled={isDisabled}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isDisabled}
              >
                {uploading ? 'Uploading...' : loading ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
