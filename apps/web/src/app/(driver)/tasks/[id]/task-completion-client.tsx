'use client';

import { useState, useRef, useTransition, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, Upload, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  completeDriverTask,
  failDriverInspection,
  uploadTaskFile,
} from '../../actions/driver-tasks';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormField = {
  id?: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

interface Props {
  stepInstanceId: string;
  stepType: string;
  status: string;
  defaultConfig: {
    instructions?: string;
    formSchema?: FormField[];
    requiresPhoto?: boolean;
  };
}

// ─── Root component ───────────────────────────────────────────────────────────

export function TaskCompletionClient({ stepInstanceId, stepType, status, defaultConfig }: Props) {
  if (status === 'COMPLETE') {
    return (
      <div className="flex flex-col items-center py-8 text-center gap-3">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="text-sm font-medium text-foreground">This task has already been completed.</p>
      </div>
    );
  }

  if (status === 'SKIPPED') {
    return (
      <p className="text-sm text-muted-foreground py-4">
        This task was skipped by a dispatcher.
      </p>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3">
        <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <p className="text-sm text-red-700 dark:text-red-300">
          This inspection was marked as failed. A repair sign-off has been submitted to your
          dispatcher.
        </p>
      </div>
    );
  }

  switch (stepType) {
    case 'INSPECTION_ITEM':
      return (
        <InspectionCompletion
          stepInstanceId={stepInstanceId}
          requiresPhoto={defaultConfig.requiresPhoto ?? false}
        />
      );
    case 'TRAINING_ACK':
      return <TrainingAckCompletion stepInstanceId={stepInstanceId} />;
    case 'CUSTOM_NOTE':
      return <NoteCompletion stepInstanceId={stepInstanceId} required />;
    case 'THIRD_PARTY':
      return (
        <ThirdPartyCompletion stepInstanceId={stepInstanceId} />
      );
    case 'FORM_FILL':
      return (
        <FormFillCompletion
          stepInstanceId={stepInstanceId}
          formSchema={defaultConfig.formSchema ?? []}
        />
      );
    case 'DOCUMENT_UPLOAD':
      return <DocumentUploadCompletion stepInstanceId={stepInstanceId} />;
    case 'SIGNATURE':
      return <SignatureCompletion stepInstanceId={stepInstanceId} />;
    case 'APPROVAL':
      return (
        <div className="flex items-start gap-3 rounded-lg bg-muted/60 border border-border px-4 py-3">
          <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            This step requires manager approval. Contact your dispatcher to proceed.
          </p>
        </div>
      );
    default:
      return <DefaultCompletion stepInstanceId={stepInstanceId} />;
  }
}

// ─── Shared hook ──────────────────────────────────────────────────────────────

function useCompleteTask(stepInstanceId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function complete(result: Parameters<typeof completeDriverTask>[1]) {
    startTransition(async () => {
      try {
        const res = await completeDriverTask(stepInstanceId, result);
        if (!res.success) {
          toast.error(res.error ?? 'Failed to complete task');
          return;
        }
        toast.success('Task completed');
        router.push('/tasks');
      } catch {
        toast.error('Something went wrong. Please try again.');
      }
    });
  }

  return { complete, loading: isPending };
}

// ─── INSPECTION_ITEM ──────────────────────────────────────────────────────────

function InspectionCompletion({
  stepInstanceId,
  requiresPhoto,
}: {
  stepInstanceId: string;
  requiresPhoto: boolean;
}) {
  const router = useRouter();
  const { complete, loading } = useCompleteTask(stepInstanceId);
  const [mode, setMode] = useState<'idle' | 'fail'>('idle');
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFail() {
    if (requiresPhoto && !photoFile) {
      toast.error('A photo is required for this inspection failure');
      return;
    }

    setUploading(true);
    let photoUrls: string[] = [];

    try {
      if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile);
        const uploadRes = await uploadTaskFile(fd);
        if (!uploadRes.success) {
          toast.error(uploadRes.error ?? 'Photo upload failed');
          return;
        }
        photoUrls = [uploadRes.data!.s3Key];
      }
    } finally {
      setUploading(false);
    }

    const res = await failDriverInspection(stepInstanceId, {
      photoUrls,
      note: note.trim() || undefined,
    });

    if (!res.success) {
      toast.error(res.error ?? 'Failed to record inspection');
      return;
    }
    toast.success('Inspection failure recorded');
    router.push('/tasks');
  }

  if (mode === 'idle') {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">Inspection result</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-16 text-base bg-green-600 hover:bg-green-700 text-white gap-2"
            disabled={loading}
            onClick={() => complete({ passOrFail: 'pass' })}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            Pass
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-base border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 gap-2"
            onClick={() => setMode('fail')}
          >
            <XCircle className="h-5 w-5" />
            Fail
          </Button>
        </div>
      </div>
    );
  }

  const isBusy = loading || uploading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">Report failure</p>
        <button
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMode('idle')}
          disabled={isBusy}
        >
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fail-note">Notes (optional)</Label>
        <Textarea
          id="fail-note"
          placeholder="Describe the issue..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          disabled={isBusy}
          className="resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fail-photo">
          Photo{requiresPhoto ? ' (required)' : ' (optional)'}
        </Label>
        <input
          id="fail-photo"
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() => fileRef.current?.click()}
          disabled={isBusy}
        >
          <Upload className="h-4 w-4" />
          {photoFile ? photoFile.name : 'Choose photo'}
        </Button>
      </div>

      <Button
        className="w-full bg-red-600 hover:bg-red-700 text-white"
        onClick={handleFail}
        disabled={isBusy}
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Submit Fail Report
      </Button>
    </div>
  );
}

// ─── TRAINING_ACK ─────────────────────────────────────────────────────────────

function TrainingAckCompletion({ stepInstanceId }: { stepInstanceId: string }) {
  const [checked, setChecked] = useState(false);
  const { complete, loading } = useCompleteTask(stepInstanceId);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <input
          id="ack"
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={loading}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
        />
        <Label htmlFor="ack" className="text-sm leading-snug cursor-pointer">
          I confirm I have reviewed this training material and understand the requirements.
        </Label>
      </div>
      <Button
        className="w-full"
        disabled={!checked || loading}
        onClick={() => complete({ acknowledged: true })}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Mark Complete
      </Button>
    </div>
  );
}

// ─── CUSTOM_NOTE ──────────────────────────────────────────────────────────────

function NoteCompletion({
  stepInstanceId,
  required,
}: {
  stepInstanceId: string;
  required?: boolean;
}) {
  const [note, setNote] = useState('');
  const { complete, loading } = useCompleteTask(stepInstanceId);
  const trimmed = note.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="note">Notes{required ? '' : ' (optional)'}</Label>
        <Textarea
          id="note"
          placeholder="Add your notes here..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          disabled={loading}
          className="resize-none"
        />
      </div>
      <Button
        className="w-full"
        disabled={(required && !trimmed) || loading}
        onClick={() => complete({ note: trimmed })}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Submit
      </Button>
    </div>
  );
}

// ─── THIRD_PARTY ──────────────────────────────────────────────────────────────

function ThirdPartyCompletion({ stepInstanceId }: { stepInstanceId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trimmed = note.trim();

  async function handleSubmit() {
    if (!trimmed && !file) {
      toast.error('Please add a note or upload a document');
      return;
    }

    setLoading(true);
    try {
      let fileUrls: string[] | undefined;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await uploadTaskFile(fd);
        if (!uploadRes.success) {
          toast.error(uploadRes.error ?? 'Upload failed');
          return;
        }
        fileUrls = [uploadRes.data!.s3Key];
      }

      const res = await completeDriverTask(stepInstanceId, {
        note: trimmed || undefined,
        fileUrls,
      });
      if (!res.success) {
        toast.error(res.error ?? 'Failed to complete task');
        return;
      }
      toast.success('Task completed');
      router.push('/tasks');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tp-note">Notes</Label>
        <Textarea
          id="tp-note"
          placeholder="Describe what was done..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          disabled={loading}
          className="resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tp-file">Document (optional)</Label>
        <input
          id="tp-file"
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          <Upload className="h-4 w-4" />
          {file ? file.name : 'Upload document'}
        </Button>
      </div>

      <Button className="w-full" disabled={loading} onClick={handleSubmit}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Submit
      </Button>
    </div>
  );
}

// ─── FORM_FILL ────────────────────────────────────────────────────────────────

function FormFillCompletion({
  stepInstanceId,
  formSchema,
}: {
  stepInstanceId: string;
  formSchema: FormField[];
}) {
  const { complete, loading } = useCompleteTask(stepInstanceId);
  const [values, setValues] = useState<Record<string, string>>({});

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    // Validate required fields
    for (const field of formSchema) {
      const key = field.id ?? field.label ?? '';
      if (!key) continue;
      if (field.required && !values[key]?.trim()) {
        toast.error(`"${field.label ?? key}" is required`);
        return;
      }
    }
    complete({ formData: values });
  }

  if (formSchema.length === 0) {
    return <DefaultCompletion stepInstanceId={stepInstanceId} />;
  }

  return (
    <div className="space-y-5">
      {formSchema.map((field, i) => {
        const key = field.id ?? field.label ?? String(i);
        const labelText = field.label ?? key;
        const value = values[key] ?? '';

        return (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`field-${key}`}>
              {labelText}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </Label>

            {field.type === 'textarea' ? (
              <Textarea
                id={`field-${key}`}
                placeholder={field.placeholder ?? ''}
                value={value}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(key, e.target.value)}
                rows={3}
                disabled={loading}
                className="resize-none"
              />
            ) : field.type === 'checkbox' ? (
              <div className="flex items-center gap-2">
                <input
                  id={`field-${key}`}
                  type="checkbox"
                  checked={value === 'true'}
                  onChange={(e) => set(key, String(e.target.checked))}
                  disabled={loading}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                />
                <Label htmlFor={`field-${key}`} className="cursor-pointer font-normal">
                  {field.placeholder ?? 'Yes'}
                </Label>
              </div>
            ) : field.type === 'select' && Array.isArray(field.options) ? (
              <select
                id={`field-${key}`}
                value={value}
                onChange={(e) => set(key, e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select...</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`field-${key}`}
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={field.placeholder ?? ''}
                value={value}
                onChange={(e) => set(key, e.target.value)}
                disabled={loading}
              />
            )}
          </div>
        );
      })}

      <Button className="w-full" disabled={loading} onClick={handleSubmit}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Submit
      </Button>
    </div>
  );
}

// ─── DOCUMENT_UPLOAD ──────────────────────────────────────────────────────────

function DocumentUploadCompletion({ stepInstanceId }: { stepInstanceId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await uploadTaskFile(fd);
      if (!uploadRes.success) {
        toast.error(uploadRes.error ?? 'Upload failed');
        return;
      }

      const res = await completeDriverTask(stepInstanceId, {
        fileUrls: [uploadRes.data!.s3Key],
      });
      if (!res.success) {
        toast.error(res.error ?? 'Failed to complete task');
        return;
      }
      toast.success('Task completed');
      router.push('/tasks');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className={`w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
          file
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/30'
        } disabled:opacity-50`}
      >
        {file ? (
          <>
            <FileText className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground break-all text-center">{file.name}</p>
            <p className="text-xs text-muted-foreground">Tap to change</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Tap to select a file</p>
            <p className="text-xs text-muted-foreground">PDF, JPEG, PNG · max 10 MB</p>
          </>
        )}
      </button>

      <Button className="w-full" disabled={!file || loading} onClick={handleUpload}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Upload & Complete
      </Button>
    </div>
  );
}

// ─── SIGNATURE ────────────────────────────────────────────────────────────────

function SignatureCompletion({ stepInstanceId }: { stepInstanceId: string }) {
  const [name, setName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const { complete, loading } = useCompleteTask(stepInstanceId);
  const trimmed = name.trim();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="sig-name">Full name</Label>
        <Input
          id="sig-name"
          placeholder="Type your full name to sign"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id="sig-confirm"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={loading}
          className="mt-0.5 h-4 w-4 rounded border-input accent-primary cursor-pointer"
        />
        <Label htmlFor="sig-confirm" className="text-sm leading-snug cursor-pointer">
          I confirm this electronic signature represents my legal signature and I agree to the
          contents of this document.
        </Label>
      </div>

      <Button
        className="w-full"
        disabled={!trimmed || !confirmed || loading}
        onClick={() => complete({ signatureUrl: `esig:${trimmed}` })}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Sign & Complete
      </Button>
    </div>
  );
}

// ─── Default ──────────────────────────────────────────────────────────────────

function DefaultCompletion({ stepInstanceId }: { stepInstanceId: string }) {
  const { complete, loading } = useCompleteTask(stepInstanceId);

  return (
    <Button
      className="w-full"
      disabled={loading}
      onClick={() => complete({ note: 'Completed' })}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
      Mark Complete
    </Button>
  );
}
