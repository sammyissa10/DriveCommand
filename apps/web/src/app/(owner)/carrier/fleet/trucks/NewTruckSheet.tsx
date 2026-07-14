'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, ScanLine } from 'lucide-react';
import { SheetContainer, SheetInput, PrimaryButton } from '@/components/ui/ds';
import { decodeVin, type VinDecodeResult } from '@/lib/vin/decodeVin';
import { scanVinFromImage } from '@/lib/vin/scanVin';

/** Keep only VIN-legal characters (also rejects I, O, Q) and cap at 17. */
function sanitizeVin(raw: string): string {
  return raw.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17);
}

interface Values {
  vin: string;
  unitNumber: string;
  licensePlate: string;
}

const EMPTY: Values = { vin: '', unitNumber: '', licensePlate: '' };

type DecodeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; result: VinDecodeResult }
  | { status: 'fail' };

/**
 * New Truck quick-create bottom sheet (carrier fleet). VIN-first: the owner is
 * standing at the truck, so the field they reach for is the VIN off the door
 * jamb — scanned or typed. A valid VIN decodes to make/model/year, shown as a
 * confirmation line (not extra inputs). Only the fields that make the record
 * real: VIN + unit number, plus license plate. Everything else (odometer, docs,
 * service schedule) lives on Detail. Reuses the shared SheetContainer/SheetInput
 * kit — same mechanics as New Client, no local fork.
 */
export function NewTruckSheet({
  open,
  onClose,
  suggestedUnitNumber,
}: {
  open: boolean;
  onClose: () => void;
  /** Next free unit number, shown as the placeholder (e.g. "118"). */
  suggestedUnitNumber?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<{ vin?: string; unitNumber?: string }>({});
  const [decode, setDecode] = useState<DecodeState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);

  const unitRef = useRef<HTMLInputElement>(null);
  const plateRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = values.vin.length > 0 || values.unitNumber.trim().length > 0 || values.licensePlate.trim().length > 0;
  const canSubmit =
    values.vin.length === 17 &&
    values.unitNumber.trim().length > 0 &&
    decode.status !== 'loading' &&
    !submitting;

  function reset() {
    setValues(EMPTY);
    setErrors({});
    setDecode({ status: 'idle' });
    setSubmitting(false);
  }

  function handleCancel() {
    if (submitting) return;
    if (dirty && !window.confirm('Discard this truck?')) return;
    reset();
    onClose();
  }

  function setVin(raw: string) {
    const v = sanitizeVin(raw);
    setValues((prev) => ({ ...prev, vin: v }));
    setErrors((prev) => ({ ...prev, vin: undefined }));
    if (v.length !== 17) setDecode({ status: 'idle' });
  }

  // Decode on blur (and after a scan) — matches the mockup's "details autofill".
  async function runDecode(vin: string) {
    if (vin.length !== 17 || decode.status === 'ok') return;
    setDecode({ status: 'loading' });
    const result = await decodeVin(vin);
    setDecode(result ? { status: 'ok', result } : { status: 'fail' });
  }

  async function handleScan(file: File) {
    const scanned = await scanVinFromImage(file);
    if (scanned && scanned.length === 17) {
      setVin(scanned);
      navigator.vibrate?.(10);
      setDecode({ status: 'loading' });
      const result = await decodeVin(scanned);
      setDecode(result ? { status: 'ok', result } : { status: 'fail' });
    } else {
      toast.message('Couldn’t read the VIN', {
        description: 'Type it in from the door jamb instead.',
      });
    }
  }

  async function submit() {
    const nextErrors: { vin?: string; unitNumber?: string } = {};
    if (values.vin.length !== 17) nextErrors.vin = 'VIN must be 17 characters';
    if (!values.unitNumber.trim()) nextErrors.unitNumber = 'Unit number is required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const decoded = decode.status === 'ok' ? decode.result : null;
      const body: Record<string, unknown> = {
        unitNumber: values.unitNumber.trim(),
        vin: values.vin,
      };
      if (values.licensePlate.trim()) body.licensePlate = values.licensePlate.trim();
      if (decoded) {
        body.make = decoded.make;
        body.model = decoded.model;
        if (decoded.year) body.year = decoded.year;
        if (decoded.truckType) body.truckType = decoded.truckType;
      }

      const res = await fetch('/api/v1/carrier/fleet/trucks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        field?: 'vin' | 'unitNumber';
        existingUnitNumber?: string;
      };

      if (!res.ok) {
        setSubmitting(false); // sheet stays open, values preserved
        if (res.status === 409 && data.field === 'vin') {
          setErrors((prev) => ({
            ...prev,
            vin: `This VIN is already on Unit ${data.existingUnitNumber}.`,
          }));
          return;
        }
        if (res.status === 409 && data.field === 'unitNumber') {
          setErrors((prev) => ({
            ...prev,
            unitNumber: `Unit ${data.existingUnitNumber} already exists.`,
          }));
          return;
        }
        toast.error('Couldn’t add truck. Please try again.');
        return;
      }

      // Success — the progress moment.
      navigator.vibrate?.(10);
      const id = data?.data?.id;
      reset();
      onClose();
      router.refresh();
      toast.success(
        'Truck added',
        id
          ? { action: { label: 'View', onClick: () => router.push(`/carrier/fleet/trucks/${id}`) } }
          : undefined,
      );
    } catch {
      toast.error('Network error — your entries are safe. Try again.');
      setSubmitting(false);
    }
  }

  const decoded = decode.status === 'ok' ? decode.result : null;

  return (
    <SheetContainer
      open={open}
      onCancel={handleCancel}
      title="Add Truck"
      subtitle="Scan the VIN or type it — details autofill."
    >
      <div className="space-y-3">
        {/* VIN — with a camera-scan affordance inside the field */}
        <div className="relative">
          <SheetInput
            label="VIN"
            required
            autoFocus
            value={values.vin}
            onChange={(e) => setVin(e.target.value)}
            onBlur={() => runDecode(values.vin)}
            error={errors.vin}
            placeholder="1FUJGLDR9NLB…"
            className="pr-12 font-mono"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={17}
            enterKeyHint="next"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runDecode(values.vin);
                unitRef.current?.focus();
              }
            }}
          />
          {/* Fixed offset clears the 13px label + gap above the 46px input. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Scan VIN with camera"
            className="absolute right-1.5 top-[30px] flex h-9 w-9 items-center justify-center rounded-[9px] text-ds-accent"
          >
            <ScanLine className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleScan(f);
              e.target.value = '';
            }}
          />
        </div>

        {/* Decode confirmation line under the VIN field */}
        {decode.status === 'loading' ? (
          <p className="text-[13px] text-ds-txt3">Decoding VIN…</p>
        ) : null}
        {decoded ? (
          <div className="flex items-center gap-2 text-[13px]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-ds-success" />
            <span className="text-ds-txt">
              {[decoded.year, decoded.make, decoded.model].filter(Boolean).join(' ')}
            </span>
          </div>
        ) : null}
        {decode.status === 'fail' && values.vin.length === 17 ? (
          <p className="text-[13px] text-ds-txt3">
            Couldn’t decode — add make &amp; model on the truck’s page.
          </p>
        ) : null}

        <SheetInput
          ref={unitRef}
          label="Unit number"
          required
          value={values.unitNumber}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, unitNumber: e.target.value }));
            setErrors((prev) => ({ ...prev, unitNumber: undefined }));
          }}
          error={errors.unitNumber}
          placeholder={suggestedUnitNumber ? `e.g. ${suggestedUnitNumber}` : 'e.g. 118'}
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              plateRef.current?.focus();
            }
          }}
        />

        <SheetInput
          ref={plateRef}
          label="License plate"
          value={values.licensePlate}
          onChange={(e) => setValues((prev) => ({ ...prev, licensePlate: e.target.value }))}
          placeholder="ABC-1234"
          autoCapitalize="characters"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canSubmit) submit();
            }
          }}
        />

        <div className="pt-1">
          <PrimaryButton
            label={submitting ? 'Adding…' : 'Add Truck'}
            onClick={submit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </div>

        <p className="pb-1 text-center text-[13px] text-ds-txt3">
          Odometer, docs, and service schedule come next.
        </p>
      </div>
    </SheetContainer>
  );
}
