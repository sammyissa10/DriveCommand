import { Info } from 'lucide-react';

/**
 * One line, inside a picker, saying why a record the user is looking for is not
 * in the list.
 *
 * TKT-0076 hides seeded sample records from operational pickers, and that rule
 * is correct — a demo truck must not be assignable to a real trip. But it was
 * shipped SILENT, and silence is what made it expensive: a record simply was
 * not there, with no reason given. That absence was misdiagnosed twice, once as
 * a `status` filter and once as a `truck_type` misclassification, before anyone
 * reached `is_sample`. A dispatcher who cannot see why a record is missing
 * files a bug, which is the same cost paid by someone who has to read the
 * query.
 *
 * The wording deliberately echoes `ConvertSampleRecord`, which is where the
 * user ends up — that component already says "It's hidden from operational
 * pickers. Convert it to a real record to keep and use it." Two surfaces, one
 * sentence between them, so finding the second one confirms the first rather
 * than raising a new question. **Keep the two in step.**
 *
 * Rendered ONLY when samples were actually excluded AND at least one exists for
 * the tenant — see `hasHiddenSamples` on each page. A note about a rule that
 * removed nothing is noise, and it would appear for every tenant that never
 * seeded.
 */
export function SampleHiddenNote({ className }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}
      // Not an alert: nothing has gone wrong and nothing needs acknowledging.
      // It is an explanation sitting next to the thing it explains.
      role="note"
    >
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">Sample records are hidden here. Convert one to use it.</span>
    </p>
  );
}

/** The same sentence, for surfaces that need the raw string. */
export const SAMPLE_HIDDEN_NOTE = 'Sample records are hidden here. Convert one to use it.';
