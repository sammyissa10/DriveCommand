'use client';

import { useState, useRef } from 'react';
import { analyzeDocument, ExtractedFreightData } from '@/app/(owner)/actions/ai-documents';

// ---------------------------------------------------------------------------
// ExtractedDataPanel
// ---------------------------------------------------------------------------

function FieldCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">
        {value ?? <span className="text-muted-foreground italic">Not found</span>}
      </dd>
    </div>
  );
}

const DOC_TYPE_BADGE: Record<string, string> = {
  rate_confirmation: 'bg-blue-100 text-blue-700 border-blue-200',
  invoice: 'bg-green-100 text-green-700 border-green-200',
  load_tender: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  other: 'bg-gray-100 text-gray-700 border-gray-200',
};

const DOC_TYPE_LABEL: Record<string, string> = {
  rate_confirmation: 'Rate Confirmation',
  invoice: 'Invoice',
  load_tender: 'Load Tender',
  other: 'Other',
};

function DocumentTypeBadge({ type }: { type: string }) {
  const cls = DOC_TYPE_BADGE[type] ?? DOC_TYPE_BADGE.other;
  const label = DOC_TYPE_LABEL[type] ?? type;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function formatAddress(obj: { name: string | null; address: string | null; city: string | null; state: string | null } | null) {
  if (!obj) return null;
  const parts = [obj.name, obj.address, [obj.city, obj.state].filter(Boolean).join(', ')].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className="whitespace-pre-line">
      {parts.join('\n')}
    </span>
  );
}

function ExtractedDataPanel({ data, fileName }: { data: ExtractedFreightData; fileName?: string }) {
  function handleCopyJson() {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {});
  }

  const shipperValue = formatAddress(data.shipper);
  const consigneeValue = formatAddress(data.consignee);
  const refNums = data.referenceNumbers?.length > 0 ? data.referenceNumbers.join(', ') : null;
  const rateWithCurrency = data.rate ? `${data.rate}${data.currency ? ` ${data.currency}` : ''}` : null;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Extracted Data</h2>
        {fileName && (
          <span className="text-xs text-muted-foreground truncate max-w-xs">{fileName}</span>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FieldCard
          label="Document Type"
          value={<DocumentTypeBadge type={data.documentType} />}
        />
        <FieldCard label="Load Number" value={data.loadNumber} />
        <FieldCard label="Shipper" value={shipperValue} />
        <FieldCard label="Consignee" value={consigneeValue} />
        <FieldCard label="Pickup Date" value={data.pickupDate} />
        <FieldCard label="Delivery Date" value={data.deliveryDate} />
        <FieldCard label="Commodity" value={data.commodity} />
        <FieldCard label="Weight" value={data.weight} />
        <FieldCard label="Rate" value={rateWithCurrency} />
        <FieldCard label="Miles" value={data.miles} />
        <FieldCard label="Reference Numbers" value={refNums} />
        <FieldCard label="Special Instructions" value={data.specialInstructions} />
      </dl>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleCopyJson}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors"
        >
          Copy JSON
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentAnalyzer (main export)
// ---------------------------------------------------------------------------

interface AnalyzerState {
  loading: boolean;
  result: ExtractedFreightData | null;
  resultFileName: string | null;
  error: string | null;
}

export function DocumentAnalyzer() {
  const [state, setState] = useState<AnalyzerState>({
    loading: false,
    result: null,
    resultFileName: null,
    error: null,
  });
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setState({
        loading: false,
        result: res.extracted,
        resultFileName: res.fileName,
        error: null,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Upload Document</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Upload a rate confirmation, invoice, or load tender. Claude will extract key freight
          data automatically.
        </p>

        <div className="mt-4">
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
            className="rounded-lg border border-dashed border-border bg-muted/30 px-8 py-6 w-full text-center hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {fileName ? (
              <span className="font-medium">{fileName}</span>
            ) : (
              <span className="text-muted-foreground">Click to select a PDF or image</span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!fileName || state.loading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {state.loading ? 'Analyzing...' : 'Analyze Document'}
        </button>
      </div>

      {/* Error state */}
      {state.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
          {state.error}
        </div>
      )}

      {/* Results panel */}
      {state.result && (
        <ExtractedDataPanel data={state.result} fileName={state.resultFileName ?? undefined} />
      )}
    </div>
  );
}
