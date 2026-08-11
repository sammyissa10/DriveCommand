import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  FileText,
  Info,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react-native'
import {
  ownerImportsApi,
  type ClientOption,
  type ClientPrefill,
  type ClientSlotView,
  type ContractOption,
  type ContractSlotView,
  type ImportResolutionView,
  type ImportView,
  type WhyView,
} from '@drivecommand/api-client'
import { useRouter } from 'expo-router'
import { BottomSheet } from '../ui/BottomSheet'
import { ImportTemplate } from './ImportTemplate'
import { ImportEndStop } from './ImportEndStop'
import { haptic } from '../../lib/haptics'
import { useThemeColors, radii, spacing, typography } from '../../constants/tokens'

/**
 * Screen 3 — "We found this" (spec Section 4.1), and the questions that stand
 * in front of it (Section 4.2).
 *
 * Same behaviour as the web card and the same server behind it, because the
 * decision of what to show is made server-side: `resolution.client.state` and
 * `resolution.contract.state` are computed by `resolution.ts`, so the two
 * surfaces cannot disagree about whether a document resolved. What differs here
 * is only the rendering — 44px targets, a bottom sheet for "why" instead of a
 * popover, and no hover.
 *
 * WIZARD STATE. Every write returns the whole resolution view, which is applied
 * straight to state. Nothing about where the user is lives on this device: the
 * import row holds the client and contract ids, so backgrounding the app,
 * killing it, or creating a client mid-flow all resume exactly here.
 */

const TOUCH = 44
const SEARCH_DEBOUNCE_MS = 300

type Colors = ReturnType<typeof useThemeColors>

interface Props {
  token: string
  view: ImportView
  onChange: (next: ImportView) => void
}

export function ImportResolutionCard({ token, view, onChange }: Props) {
  const c = useThemeColors()
  const router = useRouter()
  const [open, setOpen] = useState<'client' | 'contract' | 'date' | null>(null)
  const [why, setWhy] = useState<{ label: string; why: WhyView } | null>(null)

  const r = view.resolution
  if (!r) return null

  const apply = (resolution: ImportResolutionView) => {
    onChange({ ...view, resolution })
    setOpen(null)
  }

  /**
   * Re-read the whole resolution after a template write.
   *
   * Committing a template also commits the contract and the client behind it
   * (`ensureTemplateCommitted` composes `ensureContractCommitted`), so
   * refreshing only the template row would leave two slots on screen that the
   * server has since written — the same class of stale card quick-508's bug
   * produced.
   */
  const reloadResolution = async () => {
    try {
      apply(await ownerImportsApi.getResolution(token, view.id))
    } catch {
      // Left as it was rather than blanked. The write itself already reported.
    }
  }

  // ---- The unresolved decision gets the screen to itself -------------------
  if (r.client.state === 'UNRESOLVED') {
    return <ClientDecision token={token} importId={view.id} slot={r.client} onResolved={apply} c={c} />
  }
  if (r.contract.state !== 'RESOLVED') {
    return (
      <ContractDecision
        token={token}
        importId={view.id}
        slot={r.contract}
        clientName={r.client.value?.name ?? 'This client'}
        onResolved={apply}
        c={c}
      />
    )
  }

  // ---- Everything collapsed ------------------------------------------------
  return (
    <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard }}>
      <CardRow
        label="Client"
        value={r.client.value?.name ?? '—'}
        why={r.client.why}
        onWhy={() => r.client.why && setWhy({ label: 'Client', why: r.client.why })}
        onChange={() => setOpen(open === 'client' ? null : 'client')}
        c={c}
      />
      {open === 'client' ? (
        <ClientDecision
          token={token}
          importId={view.id}
          slot={r.client}
          onResolved={apply}
          onCancel={() => setOpen(null)}
          compact
          c={c}
        />
      ) : null}

      <Divider c={c} />

      <CardRow
        label="Contract"
        value={r.contract.value ? contractLabel(r.contract.value) : '—'}
        tag={r.contract.value?.isOneTime ? 'One-time' : null}
        why={r.contract.why}
        onWhy={() => r.contract.why && setWhy({ label: 'Contract', why: r.contract.why })}
        onChange={() => setOpen(open === 'contract' ? null : 'contract')}
        c={c}
      />
      {open === 'contract' ? (
        <ContractDecision
          token={token}
          importId={view.id}
          slot={r.contract}
          clientName={r.client.value?.name ?? 'This client'}
          onResolved={apply}
          onCancel={() => setOpen(null)}
          compact
          c={c}
        />
      ) : null}

      <Divider c={c} />

      {/* Template — real as of Phase 6 (spec Section 8). Which of the three
          presentations is shown is decided server-side by the score, so this
          file compares nothing to 0.75. */}
      <ImportTemplate
        token={token}
        importId={view.id}
        slot={r.template}
        onChanged={() => void reloadResolution()}
      />

      <Divider c={c} />

      {/* Where the day ends — real as of Phase 7 (spec Section 9). Loads its own
          slot: the resolution payload is Phase 3's shape and the end stop
          resolves against three layers this card does not hold. Its "use my
          company default" is a POST that REMOVES the stored decision, not a
          re-read that would return it. */}
      <ImportEndStop token={token} importId={view.id} onChanged={() => void reloadResolution()} />

      <Divider c={c} />

      <DateRow
        token={token}
        importId={view.id}
        value={r.documentDate}
        isOpen={open === 'date'}
        onToggle={() => setOpen(open === 'date' ? null : 'date')}
        onResolved={apply}
        c={c}
      />

      <View style={{ borderTopWidth: 1, borderTopColor: c.divider, marginTop: spacing.md, paddingTop: spacing.md }}>
        <Text style={{ ...typography.title3, color: c.textPrimary, fontWeight: '700' }}>
          {r.stops.total} stop{r.stops.total === 1 ? '' : 's'}
        </Text>
        {/* Section 4.1 draws "11 matched · 1 new" here. Facility matching is the
            next phase, so the breakdown is absent rather than shown as
            "0 matched", which would be a claim nothing has checked. */}
        <Text style={{ ...typography.caption1, color: c.textTertiary, marginTop: 2 }}>{r.stops.note}</Text>
      </View>

      {view.summary && view.summary.warnings.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.divider, marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.sm }}>
          {view.summary.warnings.map((w, i) => (
            <View key={`${w.code}-${i}`} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Info color={c.textTertiary} size={14} />
              <Text style={{ ...typography.caption1, color: c.textSecondary, flex: 1 }}>{w.message}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* ---- Review stops. LIVE as of Phase 5. ----
          This card stays the entry step: it is the only way in, so the client
          and the contract are always decided before anyone starts moving stops
          around. A document with no stops has nothing to review and says so
          rather than opening an empty screen. */}
      <View style={{ borderTopWidth: 1, borderTopColor: c.divider, marginTop: spacing.md, paddingTop: spacing.md }}>
        <Pressable
          disabled={r.stops.total === 0}
          onPress={() => {
            haptic.medium()
            router.push({
              pathname: '/(owner)/imports/review/[id]',
              params: { id: view.id, title: view.summary?.title ?? view.originalName ?? '' },
            } as never)
          }}
          accessibilityRole="button"
          accessibilityLabel="Review stops"
          accessibilityState={{ disabled: r.stops.total === 0 }}
          style={{
            minHeight: 52,
            borderRadius: radii.md,
            backgroundColor: c.brandDark,
            opacity: r.stops.total === 0 ? 0.5 : 1,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: spacing.sm,
          }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Review stops</Text>
          <ArrowRight color="#ffffff" size={17} />
        </Pressable>
        {/* Says only what it can know. This once ended "The client and contract
            above are saved", which this component cannot establish: RESOLVED
            means the server resolved the slot, not that it wrote it
            (quick-508/510). What IS true is that stop review is a mutation
            boundary — it is the first thing that will commit them. */}
        <Text style={{ ...typography.caption1, color: c.textTertiary, textAlign: 'center', marginTop: spacing.sm }}>
          {r.stops.total > 0
            ? 'Check the order, the quantities and the facilities before this becomes a trip.'
            : 'No stops were read from this document.'}
        </Text>
      </View>

      <WhySheet entry={why} onClose={() => setWhy(null)} c={c} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function Divider({ c }: { c: Colors }) {
  return <View style={{ height: 1, backgroundColor: c.divider }} />
}

function CardRow({
  label,
  value,
  tag,
  why,
  onWhy,
  onChange,
  c,
}: {
  label: string
  value: string
  tag?: string | null
  why: WhyView | null
  onWhy: () => void
  onChange: () => void
  c: Colors
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm }}>
      <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>{label}</Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flexShrink: 1 }}>
          {value}
        </Text>
        {tag ? (
          <View style={{ backgroundColor: c.warningBg, borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ ...typography.caption2, color: c.warning, fontWeight: '600' }}>{tag}</Text>
          </View>
        ) : null}
      </View>

      {/* The "why" affordance: small, secondary, never noisy (spec 4.2). */}
      {why ? (
        <Pressable
          onPress={onWhy}
          accessibilityRole="button"
          accessibilityLabel={`Why this ${label.toLowerCase()} was chosen`}
          hitSlop={12}
          style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.xs }}
        >
          <Text style={{ ...typography.caption1, color: c.textTertiary, textDecorationLine: 'underline' }}>
            why
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onChange}
        accessibilityRole="button"
        accessibilityLabel={`Change ${label.toLowerCase()}`}
        style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
      >
        <Pencil color={c.brand} size={17} />
      </Pressable>
    </View>
  )
}

/**
 * The date row.
 *
 * Spec 1.2 callout (3) is that a date can be printed in a field labelled
 * "Number" — this is where extraction is most likely to be plausibly wrong, so
 * it gets a change affordance like every other row. Typed rather than a native
 * picker: no date-picker package is installed and this phase installs nothing.
 */
function DateRow({
  token,
  importId,
  value,
  isOpen,
  onToggle,
  onResolved,
  c,
}: {
  token: string
  importId: string
  value: string | null
  isOpen: boolean
  onToggle: () => void
  onResolved: (r: ImportResolutionView) => void
  c: Colors
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      onResolved(await ownerImportsApi.setDocumentDate(token, importId, draft.trim() || null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the date.')
      setSaving(false)
    }
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm }}>
        <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Date</Text>
        <Text numberOfLines={1} style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flex: 1 }}>
          {value ? formatDocumentDate(value) : 'None on the document'}
        </Text>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel="Change date"
          style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
        >
          <Pencil color={c.brand} size={17} />
        </Pressable>
      </View>

      {isOpen ? (
        <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          <Field value={draft} onChangeText={setDraft} placeholder="YYYY-MM-DD" label="Document date" c={c} />
          {error ? <Text style={{ ...typography.footnote, color: c.danger }}>{error}</Text> : null}
          <PrimaryAction label="Save date" icon={Check} onPress={save} busy={saving} c={c} />
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function ClientDecision({
  token,
  importId,
  slot,
  onResolved,
  onCancel,
  compact,
  c,
}: {
  token: string
  importId: string
  slot: ClientSlotView
  onResolved: (r: ImportResolutionView) => void
  onCancel?: () => void
  compact?: boolean
  c: Colors
}) {
  const [query, setQuery] = useState(slot.documentText ?? '')
  const [candidates, setCandidates] = useState<ClientOption[]>(slot.candidates)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const initialQuery = useRef(slot.documentText ?? '')

  useEffect(() => {
    if (query === initialQuery.current) {
      setCandidates(slot.candidates)
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const next = await ownerImportsApi.getResolution(token, importId, query)
        if (!cancelled) setCandidates(next.client.candidates)
      } catch {
        /* a failed search is not worth an error banner — the list simply stays */
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, token, importId, slot.candidates])

  const select = useCallback(
    async (clientId: string) => {
      haptic.light()
      setSaving(true)
      setError(null)
      try {
        onResolved(await ownerImportsApi.setClient(token, importId, clientId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not set the client.')
        setSaving(false)
      }
    },
    [token, importId, onResolved],
  )

  if (creating) {
    return (
      <CreateClientForm
        token={token}
        importId={importId}
        prefill={{ ...slot.createPrefill, name: query || slot.createPrefill.name }}
        onDone={onResolved}
        onBack={() => setCreating(false)}
        c={c}
      />
    )
  }

  return (
    <View
      style={
        compact
          ? { gap: spacing.md, paddingBottom: spacing.md }
          : { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard, gap: spacing.md }
      }
    >
      {!compact ? (
        <View>
          <Text style={{ ...typography.title3, color: c.textPrimary, fontWeight: '700' }}>Which client?</Text>
          <Text style={{ ...typography.footnote, color: c.textSecondary, marginTop: spacing.xs }}>
            {slot.documentText
              ? `The document says “${slot.documentText}”. That did not match exactly one active client.`
              : 'The document did not name a shipper we could read.'}
          </Text>
        </View>
      ) : null}

      <Field
        value={query}
        onChangeText={setQuery}
        placeholder="Search clients"
        label="Search clients"
        icon={Search}
        busy={searching}
        autoFocus
        c={c}
      />

      {error ? <Text style={{ ...typography.footnote, color: c.danger }}>{error}</Text> : null}

      <View>
        {candidates.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => void select(option.id)}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={`Use ${option.name}`}
            style={{
              minHeight: TOUCH + 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.sm,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Building2 color={c.textSecondary} size={18} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                {option.name}
              </Text>
              <Text numberOfLines={1} style={{ ...typography.caption1, color: c.textTertiary }}>
                {[option.dbaName, [option.city, option.state].filter(Boolean).join(', ')]
                  .filter(Boolean)
                  .join(' · ') || 'No address on file'}
                {option.activeContractCount > 0
                  ? ` · ${option.activeContractCount} active contract${option.activeContractCount === 1 ? '' : 's'}`
                  : ' · no active contract'}
              </Text>
            </View>
            {/* When the system is asking rather than telling, how close each
                option is IS the useful information — so the score is on the row
                here, not hidden behind "why". */}
            {option.score != null ? (
              <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                {Math.round(option.score * 100)}%
              </Text>
            ) : null}
            <ChevronRight color={c.textTertiary} size={16} />
          </Pressable>
        ))}
      </View>

      {candidates.length === 0 && !searching ? (
        <Text style={{ ...typography.footnote, color: c.textSecondary }}>
          No client matches {query ? `“${query}”` : 'that name'}.
        </Text>
      ) : null}

      <SecondaryAction
        label={`Create “${query.trim() || slot.createPrefill.name || 'new client'}”`}
        icon={Plus}
        onPress={() => setCreating(true)}
        c={c}
      />
      {onCancel ? <SecondaryAction label="Cancel" onPress={onCancel} c={c} /> : null}
    </View>
  )
}

/**
 * Create-new, pre-filled from extraction.
 *
 * Only the fields the document actually carried are rendered. A screenful of
 * empty inputs at 5:30am is the thing the constraint "never show a form with
 * many empty fields" exists to prevent; the rest of the client record lives on
 * the client page and nothing here blocks filling it in later.
 */
function CreateClientForm({
  token,
  importId,
  prefill,
  onDone,
  onBack,
  c,
}: {
  token: string
  importId: string
  prefill: ClientPrefill
  onDone: (r: ImportResolutionView) => void
  onBack: () => void
  c: Colors
}) {
  const [values, setValues] = useState<ClientPrefill>(prefill)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shown = (
    [
      ['primaryContact', 'Primary contact'],
      ['phone', 'Phone'],
      ['email', 'Email'],
      ['addressLine1', 'Address'],
      ['city', 'City'],
      ['state', 'State'],
      ['zip', 'ZIP'],
    ] as Array<[keyof ClientPrefill, string]>
  ).filter(([key]) => Boolean(prefill[key]))

  async function submit() {
    if (!values.name.trim()) {
      setError('A client name is required.')
      return
    }
    haptic.medium()
    setSaving(true)
    setError(null)
    try {
      onDone(await ownerImportsApi.createClient(token, importId, values))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the client.')
      setSaving(false)
    }
  }

  return (
    <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard, gap: spacing.md }}>
      <View>
        <Text style={{ ...typography.title3, color: c.textPrimary, fontWeight: '700' }}>New client</Text>
        <Text style={{ ...typography.footnote, color: c.textSecondary, marginTop: spacing.xs }}>
          Filled in from the document. Correct anything that was misread.
        </Text>
      </View>

      <Field
        value={values.name}
        onChangeText={(v) => setValues((p) => ({ ...p, name: v }))}
        label="Company name"
        autoFocus
        c={c}
      />
      {shown.map(([key, label]) => (
        <Field
          key={key}
          value={(values[key] as string | null) ?? ''}
          onChangeText={(v) => setValues((p) => ({ ...p, [key]: v }))}
          label={label}
          c={c}
        />
      ))}

      {error ? <Text style={{ ...typography.footnote, color: c.danger }}>{error}</Text> : null}

      <PrimaryAction label="Create and use" icon={Check} onPress={submit} busy={saving} c={c} />
      <SecondaryAction label="Back to the list" onPress={onBack} c={c} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export function contractLabel(c: ContractOption): string {
  return c.contractName?.trim() || c.contractNumber
}

function contractRateLabel(c: ContractOption): string | null {
  if (!c.baseRate) return null
  const amount = Number(c.baseRate)
  if (!Number.isFinite(amount)) return c.baseRate
  const money = amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return c.rateType === 'flat' ? `${money} flat` : c.rateType === 'per_mile' ? `${money}/mi` : money
}

function ContractDecision({
  token,
  importId,
  slot,
  clientName,
  onResolved,
  onCancel,
  compact,
  c,
}: {
  token: string
  importId: string
  slot: ContractSlotView
  clientName: string
  onResolved: (r: ImportResolutionView) => void
  onCancel?: () => void
  compact?: boolean
  c: Colors
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rate, setRate] = useState(slot.spotOffer?.totalRate ?? '')
  const [newName, setNewName] = useState('')

  async function run(fn: () => Promise<ImportResolutionView>) {
    setSaving(true)
    setError(null)
    try {
      onResolved(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the contract.')
      setSaving(false)
    }
  }

  return (
    <View
      style={
        compact
          ? { gap: spacing.md, paddingBottom: spacing.md }
          : { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard, gap: spacing.md }
      }
    >
      {!compact ? (
        <View>
          <Text style={{ ...typography.title3, color: c.textPrimary, fontWeight: '700' }}>Which contract?</Text>
          <Text style={{ ...typography.footnote, color: c.textSecondary, marginTop: spacing.xs }}>
            {slot.candidates.length > 0
              ? `${clientName} has ${slot.candidates.length} active contracts.`
              : `${clientName} has no active contract yet.`}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={{ ...typography.footnote, color: c.danger }}>{error}</Text> : null}

      {slot.candidates.map((option) => (
        <Pressable
          key={option.id}
          onPress={() => void run(() => ownerImportsApi.setContract(token, importId, option.id))}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={`Use ${contractLabel(option)}`}
          style={{
            minHeight: TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            opacity: saving ? 0.5 : 1,
          }}
        >
          <FileText color={c.textSecondary} size={18} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text numberOfLines={1} style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flexShrink: 1 }}>
                {contractLabel(option)}
              </Text>
              {option.isOneTime ? (
                <View style={{ backgroundColor: c.warningBg, borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ ...typography.caption2, color: c.warning, fontWeight: '600' }}>One-time</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ ...typography.caption1, color: c.textTertiary }}>
              {[option.contractNumber, contractRateLabel(option), option.expirationDate ? `to ${option.expirationDate}` : 'no end date']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <ChevronRight color={c.textTertiary} size={16} />
        </Pressable>
      ))}

      {/* The one-time contract, offered only for a rate confirmation. Named,
          priced and dated on screen BEFORE it is created — it shows up in the
          client's contract list afterwards and nobody should be surprised by
          what landed there. */}
      {slot.spotOffer ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: radii.md, padding: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Sparkles color={c.brand} size={16} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                Make a one-time contract from this rate confirmation
              </Text>
              <Text style={{ ...typography.caption1, color: c.textTertiary, marginTop: 2 }}>
                {slot.spotOffer.detail}
              </Text>
            </View>
          </View>

          <Field
            value={rate}
            onChangeText={setRate}
            label="Flat rate from the document"
            placeholder="0.00"
            keyboardType="decimal-pad"
            c={c}
          />
          {!slot.spotOffer.totalRate ? (
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>
              No rate could be read off the document — type the agreed amount.
            </Text>
          ) : null}

          <View style={{ gap: 2 }}>
            <Text style={{ ...typography.caption1, color: c.textSecondary }}>
              Will be called: <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{slot.spotOffer.proposedName}</Text>
            </Text>
            <Text style={{ ...typography.caption1, color: c.textSecondary }}>
              Effective {slot.spotOffer.effectiveDate} only — one trip, not a standing agreement.
            </Text>
          </View>

          <PrimaryAction
            label="Create one-time contract"
            onPress={() => run(() => ownerImportsApi.createSpotContract(token, importId, rate.trim()))}
            busy={saving}
            disabled={!rate.trim()}
            c={c}
          />
        </View>
      ) : null}

      {/* A contract created here rather than on the web portal, below the
          options because when there are options they are the likely answer.
          A client added inline a moment ago has none at all, and a picker whose
          every row is the wrong agreement is the same dead end wearing a list. */}
      {slot.createOffer ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, borderRadius: radii.md, padding: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Plus color={c.brand} size={16} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                {slot.candidates.length > 0
                  ? `None of these? Create a contract for ${slot.createOffer.clientName}`
                  : `Create a contract for ${slot.createOffer.clientName}`}
              </Text>
              <Text style={{ ...typography.caption1, color: c.textTertiary, marginTop: 2 }}>
                {slot.createOffer.detail}
              </Text>
            </View>
          </View>

          {/* Nothing is pre-filled and no rate is asked for: the document that
              reaches this branch carries none. It is set on the contract. */}
          <Field
            value={newName}
            onChangeText={setNewName}
            label="Name it (optional)"
            placeholder="Standard freight"
            c={c}
          />
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            Left blank, it takes its contract number as its name.
          </Text>

          <PrimaryAction
            label="Create and use"
            icon={Check}
            onPress={() => run(() => ownerImportsApi.createContract(token, importId, newName.trim() || undefined))}
            busy={saving}
            c={c}
          />
        </View>
      ) : null}

      {/* Left for the one state this component cannot act on: no client yet. */}
      {slot.blockedReason ? (
        <Text style={{ ...typography.footnote, color: c.textSecondary }}>{slot.blockedReason}</Text>
      ) : null}

      {onCancel ? <SecondaryAction label="Cancel" onPress={onCancel} c={c} /> : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// "Why"
// ---------------------------------------------------------------------------

const VIA_LABEL: Record<WhyView['via'], string> = {
  EXACT_MATCH: 'Exact name match',
  PROFILE_ALIAS: 'Saved on this client',
  ONLY_ACTIVE_CONTRACT: 'Only active contract',
  PROFILE_PIN: 'Pinned to this client',
  CHOSEN: 'You chose it',
  CREATED: 'Created from this document',
}

function WhySheet({
  entry,
  onClose,
  c,
}: {
  entry: { label: string; why: WhyView } | null
  onClose: () => void
  c: Colors
}) {
  return (
    <BottomSheet visible={Boolean(entry)} onClose={onClose} title={entry ? `Why this ${entry.label.toLowerCase()}?` : ''} snapPoint="40%">
      {entry ? (
        <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}>
          <Text style={{ ...typography.caption1, color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {VIA_LABEL[entry.why.via]}
          </Text>
          <Text style={{ ...typography.subhead, color: c.textPrimary }}>{entry.why.detail}</Text>

          {entry.why.documentText ? (
            <WhyLine label="On the document" value={entry.why.documentText} c={c} />
          ) : null}
          {entry.why.matchedText ? <WhyLine label="Matched" value={entry.why.matchedText} c={c} /> : null}
          {entry.why.score != null ? (
            <WhyLine label="Score" value={`${Math.round(entry.why.score * 100)}%`} c={c} />
          ) : (
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>
              No score — this was set by a person, not matched.
            </Text>
          )}
        </ScrollView>
      ) : null}
    </BottomSheet>
  )
}

function WhyLine({ label, value, c }: { label: string; value: string; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <Text style={{ ...typography.caption1, color: c.textSecondary, width: 110 }}>{label}</Text>
      <Text style={{ ...typography.caption1, color: c.textPrimary, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Small shared controls
//
// Local rather than from components/ui because those take the static `colors`
// export and every screen in this flow is on `useThemeColors`. Nothing is
// installed and nothing existing is changed.
// ---------------------------------------------------------------------------

function Field({
  value,
  onChangeText,
  label,
  placeholder,
  icon: Icon,
  busy,
  autoFocus,
  keyboardType,
  c,
}: {
  value: string
  onChangeText: (v: string) => void
  label: string
  placeholder?: string
  icon?: typeof Search
  busy?: boolean
  autoFocus?: boolean
  keyboardType?: 'default' | 'decimal-pad'
  c: Colors
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.caption1, color: c.textSecondary }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: TOUCH,
          borderRadius: radii.md,
          backgroundColor: c.surfaceElevated,
          paddingHorizontal: spacing.md,
        }}
      >
        {Icon ? <Icon color={c.textTertiary} size={16} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.textTertiary}
          autoFocus={autoFocus}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize="none"
          accessibilityLabel={label}
          style={{ flex: 1, color: c.textPrimary, fontSize: 16, paddingVertical: spacing.sm }}
        />
        {busy ? <ActivityIndicator color={c.textTertiary} size="small" /> : null}
      </View>
    </View>
  )
}

function PrimaryAction({
  label,
  icon: Icon,
  onPress,
  busy,
  disabled,
  c,
}: {
  label: string
  icon?: typeof Check
  onPress: () => void | Promise<void>
  busy?: boolean
  disabled?: boolean
  c: Colors
}) {
  const off = busy || disabled
  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 52,
        borderRadius: radii.md,
        backgroundColor: c.brandDark,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        opacity: off ? 0.5 : 1,
      }}
    >
      {busy ? <ActivityIndicator color="#ffffff" size="small" /> : Icon ? <Icon color="#ffffff" size={17} /> : null}
      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  )
}

function SecondaryAction({
  label,
  icon: Icon,
  onPress,
  c,
}: {
  label: string
  icon?: typeof Plus
  onPress: () => void
  c: Colors
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: TOUCH,
        borderRadius: radii.md,
        backgroundColor: c.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
      }}
    >
      {Icon ? <Icon color={c.brand} size={16} /> : null}
      <Text numberOfLines={1} style={{ ...typography.subhead, color: c.brand, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  )
}

/** "Mon 27 Jul", as drawn in Section 4.1. UTC — the column is date-only. */
export function formatDocumentDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}
