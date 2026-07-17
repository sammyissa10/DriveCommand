'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, FileText, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import {
  MobileScreen,
  LargeTitleHeader,
  SectionHeader,
  PrimaryButton,
  StatusPill,
  type StatusTone,
} from '@/components/ui/ds';
import { analyzeDocument, type ExtractedFreightData } from '@/app/(owner)/actions/ai-documents';

const DOC_TYPE_LABEL: Record<string, string> = {
  rate_confirmation: 'Rate Confirmation',
  invoice: 'Invoice',
  load_tender: 'Load Tender',
  other: 'Other',
};

const DOC_TYPE_TONE: Record<string, StatusTone> = {
  rate_confirmation: 'accent',
  invoice: 'success',
  load_tender: 'warning',
  other: 'neutral',
};

function formatAddress(
  obj: { name: string | null; address: string | null; city: string | null; state: string | null } | null,
): string | null {
  if (!obj) return null;
  const parts = [obj.name, obj.address, [obj.city, obj.state].filter(Boolean).join(', ')].filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

/** Stacked label/value card — values wrap (addresses, instructions), unlike a truncating FieldGroup row. */
function FieldList({ rows }: { rows: { label: string; value: string | null }[] }) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-ds-card">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="px-4 py-3">
            <p className="text-[12px] uppercase tracking-[0.6px] text-ds-txt3">{r.label}</p>
            <p className="mt-0.5 whitespace-pre-line text-[15px] text-ds-txt">
              {r.value ?? <span className="italic text-ds-txt3">Not found</span>}
            </p>
          </div>
          {i < rows.length - 1 ? <div className="ml-4 h-px bg-ds-hairline" /> : null}
        </div>
      ))}
    </div>
  );
}

interface AnalyzerState {
  loading: boolean;
  result: ExtractedFreightData | null;
  resultFileName: string | null;
  error: string | null;
}

/**
 * AI Document Reading — mobile-web design system view (owner/manager).
 *
 * Upload a freight doc → Claude extracts structured load data. The desktop's
 * bordered cards + 2-col field grid become a ds dropzone + PrimaryButton and a
 * stacked, wrapping field list (addresses/instructions need to wrap, not
 * truncate). Reached from the More menu, so it carries a back chevron.
 */
export function AiDocumentsMobile({ comingSoonMessage }: { comingSoonMessage: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, setState] = useState<AnalyzerState>({
    loading: false,
    result: null,
    resultFileName: null,
    error: null,
  });

  async function handleAnalyze() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setState({ loading: true, result: null, resultFileName: null, error: null });

    const formData = new FormData();
    formData.append('file', file);
    const res = await analyzeDocument(formData);

    if ('error' in res) {
      setState({ loading: false, result: null, resultFileName: null, error: res.error });
    } else {
      navigator.vibrate?.(10);
      setState({ loading: false, result: res.extracted, resultFileName: res.fileName, error: null });
    }
  }

  function copyJson() {
    if (!state.result) return;
    navigator.clipboard
      .writeText(JSON.stringify(state.result, null, 2))
      .then(() => toast.success('Copied'))
      .catch(() => {});
  }

  const data = state.result;
  const fields: { label: string; value: string | null }[] = data
    ? [
        { label: 'Load number', value: data.loadNumber },
        { label: 'Shipper', value: formatAddress(data.shipper) },
        { label: 'Consignee', value: formatAddress(data.consignee) },
        { label: 'Pickup date', value: data.pickupDate },
        { label: 'Delivery date', value: data.deliveryDate },
        { label: 'Commodity', value: data.commodity },
        { label: 'Weight', value: data.weight },
        { label: 'Rate', value: data.rate ? `${data.rate}${data.currency ? ` ${data.currency}` : ''}` : null },
        { label: 'Miles', value: data.miles },
        { label: 'Reference numbers', value: data.referenceNumbers?.length ? data.referenceNumbers.join(', ') : null },
        { label: 'Special instructions', value: data.specialInstructions },
      ]
    : [];

  return (
    <MobileScreen className="pb-10 pt-2">
      <LargeTitleHeader
        title="AI Documents"
        subtitle="Extract load data from freight docs"
        onBack={() => router.back()}
      />

      {/* Coming soon */}
      <div className="mb-5 flex items-start gap-3 rounded-[20px] bg-ds-warning/[0.14] p-4">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-ds-warning" />
        <div className="min-w-0">
          <StatusPill label="Coming Soon" tone="warning" />
          <p className="mt-1.5 text-[13px] text-ds-txt2">{comingSoonMessage}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Upload */}
        <div>
          <SectionHeader title="Upload document" />
          <div className="rounded-[20px] bg-ds-card p-4">
            <p className="text-[13px] text-ds-txt2">
              Upload a rate confirmation, invoice, or load tender. Claude extracts the key freight data
              automatically.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFileName(f.name);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex w-full flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-ds-hairline px-6 py-8 text-center transition active:opacity-75"
            >
              {fileName ? (
                <>
                  <FileText className="h-6 w-6 text-ds-accent" />
                  <span className="max-w-full truncate text-[15px] font-medium text-ds-txt">{fileName}</span>
                  <span className="text-[12px] text-ds-txt3">Tap to choose a different file</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-ds-txt3" />
                  <span className="text-[15px] text-ds-txt2">Tap to select a PDF or image</span>
                </>
              )}
            </button>

            <div className="mt-4">
              <PrimaryButton
                label={state.loading ? 'Analyzing…' : 'Analyze document'}
                onClick={handleAnalyze}
                disabled={!fileName}
                loading={state.loading}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {state.error ? (
          <div className="rounded-[20px] bg-ds-danger/[0.14] p-4 text-[13px] text-ds-danger">{state.error}</div>
        ) : null}

        {/* Results */}
        {data ? (
          <div>
            <SectionHeader title="Extracted data" action={{ label: 'Copy JSON', onClick: copyJson }} />
            <div className="mb-3 flex items-center gap-2">
              <StatusPill
                label={DOC_TYPE_LABEL[data.documentType] ?? data.documentType}
                tone={DOC_TYPE_TONE[data.documentType] ?? 'neutral'}
              />
              {state.resultFileName ? (
                <span className="min-w-0 truncate text-[12px] text-ds-txt3">{state.resultFileName}</span>
              ) : null}
            </div>
            <FieldList rows={fields} />
          </div>
        ) : null}
      </div>
    </MobileScreen>
  );
}
