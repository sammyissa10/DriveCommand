'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, File as FileIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  SectionHeader,
  DocumentRow,
  SheetContainer,
  PrimaryButton,
  Skeleton,
} from '@/components/ui/ds';

interface DocRow {
  id: string;
  documentType: string;
  documentTypeName: string | null;
  filename: string;
  fileSizeBytes: number | null;
  uploadedByName: string | null;
  uploadedAt: string;
  verified: boolean;
}

interface DocType {
  id: string;
  name: string;
  slug: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB — matches DocumentUploadModal
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.webp';

function fileSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Contract documents — full parity with the desktop table on mobile: list
 * (tap to open the signed URL), plus a ds upload sheet replacing the shadcn
 * DocumentUploadModal. Upload calls the same `POST /api/v1/carrier/documents`
 * multipart endpoint with the contract context.
 */
export function ContractDocuments({ contractId }: { contractId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- upload sheet state ----
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const [typesError, setTypesError] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploading = progress !== null;

  function fetchDocs() {
    setLoading(true);
    fetch(`/api/v1/carrier/contracts/${contractId}/documents`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setDocs(json.data ?? []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }

  useEffect(fetchDocs, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openDoc(id: string) {
    try {
      const res = await fetch(`/api/v1/carrier/documents/${id}/signed-url`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      window.open(json.signedUrl, '_blank');
    } catch {
      toast.error('Failed to open document');
    }
  }

  function loadTypes() {
    setTypesLoading(true);
    setTypesError(false);
    fetch('/api/v1/carrier/document-types?active_only=true')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const types = (json.data ?? []) as DocType[];
        setDocTypes(types);
        if (types.length === 0) setTypesError(true); // empty is unusual — surface it
      })
      .catch(() => {
        setDocTypes([]);
        setTypesError(true);
      })
      .finally(() => setTypesLoading(false));
  }

  function openSheet() {
    setOpen(true);
    if (docTypes.length === 0) loadTypes();
  }

  function closeSheet() {
    if (uploading) return;
    setOpen(false);
    setFile(null);
    setFileError(null);
    setTypeId('');
    setNotes('');
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadError(null);
    if (f.size > MAX_FILE_SIZE) {
      setFileError('File exceeds 25MB limit');
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(f);
  }

  function upload() {
    if (!file || !typeId || uploading) return;
    setUploadError(null);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('parent_type', 'contract');
    fd.append('parent_id', contractId);
    fd.append('document_type_id', typeId);
    fd.append('document_type', docTypes.find((t) => t.id === typeId)?.slug ?? 'other');
    fd.append('contract_id', contractId);
    if (notes.trim()) fd.append('notes', notes.trim());

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success('Document uploaded');
        setOpen(false);
        setFile(null);
        setTypeId('');
        setNotes('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchDocs();
      } else {
        let msg = 'Upload failed';
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          /* keep default */
        }
        setUploadError(msg);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setUploadError('Network error — check your connection and retry');
    };
    xhr.open('POST', '/api/v1/carrier/documents');
    xhr.send(fd);
    setProgress(0);
  }

  const canUpload = !!file && !fileError && !!typeId && !uploading;

  return (
    <div>
      <SectionHeader title="Documents" action={{ label: 'Upload', onClick: openSheet }} />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-[72px] rounded-[20px]" />
          <Skeleton className="h-[72px] rounded-[20px]" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex items-center gap-3 rounded-[20px] bg-ds-card px-4 py-5">
          <FileText className="h-5 w-5 shrink-0 text-ds-txt3" />
          <span className="text-[14px] text-ds-txt2">No documents uploaded yet.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <DocumentRow
              key={d.id}
              title={d.filename}
              meta={[d.documentTypeName ?? d.documentType.replace(/_/g, ' '), shortDate(d.uploadedAt), d.uploadedByName ?? undefined]
                .filter(Boolean)
                .join(' · ')}
              pill={d.verified ? { label: 'Verified', tone: 'success' } : undefined}
              onOpen={() => openDoc(d.id)}
            />
          ))}
        </div>
      )}

      {/* Upload sheet */}
      <SheetContainer open={open} onCancel={closeSheet} title="Upload document">
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={pickFile}
            disabled={uploading}
          />

          {file && !fileError ? (
            <div className="flex items-center gap-3 rounded-[12px] bg-ds-input px-3 py-2.5">
              <FileIcon className="h-5 w-5 shrink-0 text-ds-txt2" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-ds-txt">{file.name}</p>
                {fileSize(file.size) ? <p className="text-[13px] text-ds-txt3">{fileSize(file.size)}</p> : null}
              </div>
              {!uploading ? (
                <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label="Remove file" className="text-ds-txt3 active:opacity-60">
                  <X className="h-5 w-5" />
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-[46px] w-full items-center justify-center gap-2 rounded-[12px] bg-ds-input text-[16px] text-ds-accent active:opacity-75"
            >
              Choose a file
            </button>
          )}
          {fileError ? <p className="text-[13px] text-ds-danger">{fileError}</p> : null}
          <p className="text-[12px] text-ds-txt3">PDF, JPG, PNG, HEIC, WEBP — max 25MB</p>

          {/* Document type */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-ds-txt2">Document type</span>
              <span className="text-[13px] text-ds-txt3">Required</span>
            </div>
            {typesError ? (
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-ds-input px-3 py-2.5">
                <span className="text-[13px] text-ds-danger">Couldn&rsquo;t load document types</span>
                <button type="button" onClick={loadTypes} className="text-[13px] font-medium text-ds-accent active:opacity-70">
                  Retry
                </button>
              </div>
            ) : (
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                disabled={uploading || typesLoading}
                className="h-[46px] w-full rounded-[12px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none disabled:opacity-50"
              >
                <option value="">{typesLoading ? 'Loading types…' : 'Select type…'}</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <span className="text-[13px] text-ds-txt2">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={uploading}
              rows={2}
              placeholder="Add any notes about this document…"
              className="w-full resize-none rounded-[12px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3 disabled:opacity-50"
            />
          </div>

          {uploadError ? <p className="text-[13px] text-ds-danger">{uploadError}</p> : null}

          <PrimaryButton
            label={uploading ? `Uploading… ${progress}%` : uploadError ? 'Retry upload' : 'Upload'}
            onClick={upload}
            disabled={!canUpload}
          />
        </div>
      </SheetContainer>
    </div>
  );
}
