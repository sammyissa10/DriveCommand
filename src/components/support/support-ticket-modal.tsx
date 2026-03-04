'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { LifeBuoy, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { createSupportTicket } from '@/actions/support-tickets';
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
import { Input } from '@/components/ui/input';

const TICKET_TYPES = [
  { value: 'BUG', label: 'Bug Report' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'QUESTION', label: 'Question' },
  { value: 'ACCOUNT_ISSUE', label: 'Account Issue' },
  { value: 'OTHER', label: 'Other' },
];

export function SupportTicketModal() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Only render for authenticated users
  if (!user) return null;

  function resetForm() {
    setType('');
    setTitle('');
    setDescription('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!type) {
      toast.error('Please select a ticket type');
      return;
    }
    if (title.trim().length < 3) {
      toast.error('Title must be at least 3 characters');
      return;
    }
    if (description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }

    setLoading(true);
    try {
      const result = await createSupportTicket({
        type,
        title: title.trim(),
        description: description.trim(),
        fromPage: pathname,
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

  return (
    <>
      {/* Fixed support button — bottom-right */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg hover:from-blue-600 hover:to-blue-800 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Open support"
        title="Get support"
      >
        <LifeBuoy className="h-5 w-5" />
      </button>

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
            {/* Ticket Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Type <span className="text-destructive">*</span>
              </label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ticket type..." />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
