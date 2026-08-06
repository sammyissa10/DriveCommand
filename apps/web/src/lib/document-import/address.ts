/**
 * Address normalisation — the shared utility behind tiers 2 and 3 of the
 * facility resolution ladder.
 *
 * Spec: `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 7 —
 * "Normalisation must handle: case, punctuation, street suffixes, directionals,
 * suite/unit split, postal codes. One shared utility, tested against 30+ real
 * pairs including negatives."
 *
 * ONE IMPLEMENTATION. `facility-resolution.ts` uses it for the read-only view,
 * the mutation boundary uses the same function to decide what it may silently
 * commit, and the tests drive it from the fixture on disk. A second normaliser
 * anywhere in this module would mean the tier the card showed and the tier the
 * write believed could differ, which is the entire class of bug that quick-508
 * and quick-510 were about.
 *
 * PURE AND DETERMINISTIC. No Prisma, no fetch, no geocoder, no clock. Same two
 * strings, same verdict, every time — which is what makes it testable against a
 * fixture and what keeps it out of the network path of a document upload.
 *
 * ---------------------------------------------------------------------------
 * THE UNIT IS NOT IN THE KEY, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * `9800 Industrial Dr` and `9800 Industrial Dr Ste 200` are the same building —
 * one document printed the dock, the other did not. `2701 Busse Rd Unit 100`
 * and `2701 Busse Rd Unit 400` are two tenants who each want their own freight.
 * Both pairs share a street key, so the key alone cannot separate them.
 *
 * So `key` excludes the unit, and `normalisesEqual()` — the predicate that
 * licenses a silent T2 link — is `key equality AND unit compatibility`, where
 * compatible means "the same, or absent on one side". Anything that reads the
 * key without asking about the unit will link two tenants into one facility.
 * Use `normalisesEqual`, not `a.key === b.key`.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * USPS street suffixes, mapped to one canonical abbreviation each.
 *
 * The canonical form is the abbreviation because that is what documents print
 * most often, but the direction does not matter — only that both sides land on
 * the same token. `Rd`/`Road`, `Ave`/`Avenue`, `Dr`/`Drive` are the three that
 * account for most real variance.
 */
const STREET_SUFFIXES: Record<string, string> = {
  st: 'st', street: 'st', str: 'st',
  ave: 'ave', av: 'ave', avenue: 'ave',
  rd: 'rd', road: 'rd',
  dr: 'dr', drive: 'dr', drv: 'dr',
  blvd: 'blvd', boulevard: 'blvd', boul: 'blvd',
  ln: 'ln', lane: 'ln',
  ct: 'ct', court: 'ct',
  pl: 'pl', place: 'pl',
  ter: 'ter', terrace: 'ter',
  cir: 'cir', circle: 'cir',
  pkwy: 'pkwy', parkway: 'pkwy', pky: 'pkwy',
  hwy: 'hwy', highway: 'hwy',
  expy: 'expy', expressway: 'expy',
  trl: 'trl', trail: 'trl',
  way: 'way',
  pt: 'pt', point: 'pt',
  plz: 'plz', plaza: 'plz',
  sq: 'sq', square: 'sq',
  loop: 'loop',
  run: 'run',
  row: 'row',
  path: 'path',
  cv: 'cv', cove: 'cv',
  crk: 'crk', creek: 'crk',
  xing: 'xing', crossing: 'xing',
  ext: 'ext', extension: 'ext',
  frk: 'frk', fork: 'frk',
  gln: 'gln', glen: 'gln',
  hl: 'hl', hill: 'hl',
  is: 'is', island: 'is',
  jct: 'jct', junction: 'jct',
  knl: 'knl', knoll: 'knl',
  mnr: 'mnr', manor: 'mnr',
  rdg: 'rdg', ridge: 'rdg',
  spg: 'spg', spring: 'spg',
  trce: 'trce', trace: 'trce',
  vw: 'vw', view: 'vw',
  vlg: 'vlg', village: 'vlg',
};

/**
 * Directionals, mapped to their compass letters.
 *
 * A directional is a hard discriminator on a grid city: `3300 N Kimball` and
 * `3300 W Kimball` are miles apart in Chicago, and `800 N Wells` and
 * `800 S Wells` are on opposite sides of the river. A conflict here is scored
 * as a strong negative for exactly that reason.
 */
const DIRECTIONALS: Record<string, string> = {
  n: 'n', north: 'n',
  s: 's', south: 's',
  e: 'e', east: 'e',
  w: 'w', west: 'w',
  ne: 'ne', northeast: 'ne',
  nw: 'nw', northwest: 'nw',
  se: 'se', southeast: 'se',
  sw: 'sw', southwest: 'sw',
};

/**
 * Secondary-unit designators. The designator itself is dropped and the value
 * kept, so `Ste 200`, `Suite 200` and `# 200` all normalise to `200`.
 *
 * `dock`, `door` and `building` are in here because freight documents print
 * them constantly and they behave exactly like a suite: present on one document
 * and absent from the next for the same physical place, but two *different*
 * values mean two different receiving points.
 */
const UNIT_DESIGNATORS = [
  'ste', 'suite', 'unit', 'apt', 'apartment', 'rm', 'room', 'fl', 'floor',
  'dock', 'dk', 'door', 'bldg', 'building', 'bay', 'lot', 'space', 'spc',
  'trlr', 'trailer', 'gate', 'pier', 'slip', 'hangar', 'stop',
];

const UNIT_PATTERN = new RegExp(
  `\\b(?:${UNIT_DESIGNATORS.join('|')})\\s*\\.?\\s*#?\\s*([a-z0-9][a-z0-9-]*)\\b`,
  'i',
);

/** `#200`, `# 200` — a designator with no word in front of it. */
const HASH_UNIT_PATTERN = /#\s*([a-z0-9][a-z0-9-]*)\b/i;

const PO_BOX_PATTERN = /\bp\.?\s*o\.?\s*box\s*#?\s*([a-z0-9-]+)\b/i;

const US_STATES: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms',
  missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok',
  oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt',
  virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi',
  wyoming: 'wy', 'district of columbia': 'dc', 'puerto rico': 'pr',
  // Canada — carriers in this corridor run cross-border.
  ontario: 'on', quebec: 'qc', 'british columbia': 'bc', alberta: 'ab',
  manitoba: 'mb', saskatchewan: 'sk', 'nova scotia': 'ns', 'new brunswick': 'nb',
};

const STATE_CODES = new Set(Object.values(US_STATES));

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** The extraction's address shape, and the facility row's, structurally. */
export interface AddressInput {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface NormalisedAddress {
  /** Primary street number — the first bare integer on the street line, leading zeros stripped. */
  number: string | null;
  /**
   * Every bare integer on the street line, in order.
   *
   * A reference code printed ahead of the address (`Whse 43775 - 12000 W
   * Capitol Dr`) puts a number in front of the real one, so the primary is
   * wrong while the true street number is still present. Matching on set
   * intersection recovers that case without letting `2200` match `2800`.
   */
  numbers: string[];
  directional: string | null;
  /** Street name with the number, directional and suffix removed; ordinals reduced to digits. */
  core: string;
  suffix: string | null;
  /** Suite / unit / dock / building value, designator dropped. Never in `key`. */
  unit: string | null;
  poBox: string | null;
  city: string | null;
  /** Two-letter code, lowercase. */
  state: string | null;
  /** Five digits. ZIP+4 is truncated — the +4 is a delivery walk, not a place. */
  postal: string | null;
  /** Canonical string for T2 equality. Excludes the unit — read the file header. */
  key: string;
  /** Everything the scorer treats as the street "name", for token overlap. */
  nameTokens: string[];
  /** True when there was nothing to normalise. */
  empty: boolean;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function collapse(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Lowercase, punctuation to spaces, collapsed. `US-30` becomes `us 30`. */
function tokenise(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

const isInteger = (token: string): boolean => /^\d+$/.test(token);

/** `0450` -> `450`. A leading zero is a typing habit, not part of the address. */
function stripLeadingZeros(token: string): string {
  const trimmed = token.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

/** `95th` -> `95`, `3rd` -> `3`. Leaves anything non-ordinal alone. */
function reduceOrdinal(token: string): string {
  const m = /^(\d+)(st|nd|rd|th)$/.exec(token);
  return m ? m[1] : token;
}

/**
 * A city name, normalised. `Saint John` and `St. John` are one place.
 *
 * `saint` -> `st` is applied only in the city field. In a street line `st` is
 * Street, and collapsing the two vocabularies would turn `St Charles Rd` into
 * something it is not.
 */
export function normaliseCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = tokenise(raw).map((t) => (t === 'saint' ? 'st' : t));
  const out = tokens.join(' ');
  return out || null;
}

/** Two-letter code, lowercase, from either a code or a spelled name. */
export function normaliseState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = collapse(raw.toLowerCase().replace(/[^a-z ]+/g, ' '));
  if (!cleaned) return null;
  if (US_STATES[cleaned]) return US_STATES[cleaned];
  if (cleaned.length === 2 && STATE_CODES.has(cleaned)) return cleaned;
  return cleaned.length <= 3 ? cleaned : null;
}

/** Five digits. `60438-2841` and `60438` are the same postcode. */
export function normalisePostal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length >= 5) return digits.slice(0, 5);
  // Canadian postcodes carry letters; keep them as a collapsed alphanumeric.
  const alnum = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return alnum || null;
}

// ---------------------------------------------------------------------------
// Free-form parsing
// ---------------------------------------------------------------------------

interface RawParts {
  street: string;
  city: string | null;
  state: string | null;
  postal: string | null;
  /** Unit text found in a segment of its own, e.g. a leading `Building A`. */
  unitSegment: string | null;
}

/** Does this comma segment look like nothing but a unit designation? */
function unitOnlySegment(segment: string): string | null {
  const tokens = tokenise(segment);
  if (tokens.length === 0 || tokens.length > 3) return null;
  const m = UNIT_PATTERN.exec(segment) ?? HASH_UNIT_PATTERN.exec(segment);
  if (!m) return null;
  // The whole segment must be the designation, not a street that happens to
  // mention a dock: `Building A` yes, `3000 Lakeside Dr Dock 4` no.
  const consumed = tokenise(m[0]).length;
  return consumed >= tokens.length ? m[1].toLowerCase() : null;
}

/**
 * Pull `city / state / postal` off the tail of a locality string.
 *
 * Runs right to left because that is the only reliable direction: the postcode
 * is last when it is present, the state precedes it, and whatever remains is
 * the city. It has to work for `Chicago, IL 60624`, `Chicago IL 60651`,
 * `Bolingbrook, Illinois 60440` and a bare `IL 60624` alike.
 */
function parseLocality(raw: string): { city: string | null; state: string | null; postal: string | null } {
  let rest = collapse(raw.replace(/,/g, ' '));
  let postal: string | null = null;
  let state: string | null = null;

  const zip = /(\d{5})(?:-\d{4})?\s*$/.exec(rest);
  if (zip) {
    postal = zip[1];
    rest = collapse(rest.slice(0, zip.index));
  }

  const words = rest.split(' ').filter(Boolean);
  // Two-word state names ("New Jersey") before one-word ones, or the second
  // word alone would be read as the city.
  if (words.length >= 2) {
    const pair = `${words[words.length - 2]} ${words[words.length - 1]}`.toLowerCase();
    if (US_STATES[pair]) {
      state = US_STATES[pair];
      words.splice(words.length - 2, 2);
    }
  }
  if (!state && words.length >= 1) {
    const last = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    if (US_STATES[last] || STATE_CODES.has(last)) {
      state = US_STATES[last] ?? last;
      words.pop();
    }
  }

  return { city: words.length ? words.join(' ') : null, state, postal };
}

/**
 * Split a single printed address string into street and locality.
 *
 * The street segment is the first comma segment carrying a bare integer or a PO
 * box. Segments in front of it are either a unit designation (`Building A`) or
 * a facility name (`Midwest Distribution Center`) — the first is kept as the
 * unit, the second dropped, because a name is not part of an address and the
 * same building is printed with and without it.
 *
 * A string with no commas at all cannot be split into street and city without
 * guessing, and guessing is how `12000 W Capitol Dr Wauwatosa` silently becomes
 * a different place from `12000 W Capitol Dr, Wauwatosa`. So the city is left
 * unknown and the leftover words stay in the street: the two do not normalise
 * equal, they score highly, and a human confirms — which is T3 doing its job.
 */
function parseFreeForm(raw: string): RawParts {
  const segments = raw.split(',').map((s) => collapse(s)).filter(Boolean);

  if (segments.length === 0) return { street: '', city: null, state: null, postal: null, unitSegment: null };

  if (segments.length === 1) {
    const locality = parseLocality(segments[0]);
    // Only the state and postcode are recoverable from an undelimited line.
    // Everything ahead of them is street, name and city, undifferentiated.
    let street = segments[0];
    if (locality.postal) street = street.replace(/(\d{5})(?:-\d{4})?\s*$/, '');
    street = collapse(street);
    if (locality.state) {
      street = collapse(street.replace(/[,\s]+[A-Za-z]{2,}\s*$/, (m) =>
        normaliseState(m) === locality.state ? '' : m,
      ));
    }
    return { street, city: null, state: locality.state, postal: locality.postal, unitSegment: null };
  }

  // Never treat the trailing `IL 60624` segment as the street, even though a
  // postcode is an integer.
  let streetIndex = -1;
  for (let i = 0; i < segments.length - 1; i++) {
    if (PO_BOX_PATTERN.test(segments[i]) || tokenise(segments[i]).some(isInteger)) {
      streetIndex = i;
      break;
    }
  }
  if (streetIndex === -1) streetIndex = 0;

  let unitSegment: string | null = null;
  for (let i = 0; i < streetIndex; i++) {
    const unit = unitOnlySegment(segments[i]);
    if (unit && !unitSegment) unitSegment = unit;
    // Anything else in front of the street is a facility name, and is dropped.
  }

  const locality = parseLocality(segments.slice(streetIndex + 1).join(' '));
  return { street: segments[streetIndex], city: locality.city, state: locality.state, postal: locality.postal, unitSegment };
}

// ---------------------------------------------------------------------------
// The normaliser
// ---------------------------------------------------------------------------

function normaliseParts(parts: RawParts): NormalisedAddress {
  let street = parts.street ?? '';

  // --- PO box ---------------------------------------------------------------
  let poBox: string | null = null;
  const poMatch = PO_BOX_PATTERN.exec(street);
  if (poMatch) {
    poBox = stripLeadingZeros(poMatch[1].toLowerCase().replace(/[^a-z0-9]/g, ''));
    street = collapse(street.replace(poMatch[0], ' '));
  }

  // --- Unit, split into its own field --------------------------------------
  let unit: string | null = parts.unitSegment;
  const unitMatch = UNIT_PATTERN.exec(street) ?? HASH_UNIT_PATTERN.exec(street);
  if (unitMatch) {
    const value = unitMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (value) unit = isInteger(value) ? stripLeadingZeros(value) : value;
    street = collapse(street.replace(unitMatch[0], ' '));
  }

  // --- Street line ----------------------------------------------------------
  const tokens = tokenise(street);
  const numbers = tokens.filter(isInteger).map(stripLeadingZeros);
  const number = numbers.length ? numbers[0] : null;

  // Drop the primary number from the body once, at the position it occupied.
  const body: string[] = [];
  let droppedPrimary = false;
  for (const token of tokens) {
    if (!droppedPrimary && isInteger(token) && stripLeadingZeros(token) === number) {
      droppedPrimary = true;
      continue;
    }
    body.push(token);
  }

  // --- Suffix ---------------------------------------------------------------
  // The LAST recognised suffix wins: `W Capitol Dr Wauwatosa` has one suffix in
  // the middle, and `Frontage Road` has one at the end.
  let suffix: string | null = null;
  let suffixIndex = -1;
  for (let i = body.length - 1; i >= 0; i--) {
    const canonical = STREET_SUFFIXES[body[i]];
    if (canonical) {
      suffix = canonical;
      suffixIndex = i;
      break;
    }
  }

  // --- Directional ----------------------------------------------------------
  // A directional must have a real street name after it, or `1200 North Ave`
  // would lose its name and become a bare `n`.
  let directional: string | null = null;
  let directionalIndex = -1;
  for (let i = 0; i < body.length; i++) {
    const canonical = DIRECTIONALS[body[i]];
    if (!canonical) continue;
    const hasNameAfter = body
      .slice(i + 1)
      .some((t, j) => i + 1 + j !== suffixIndex && !STREET_SUFFIXES[t]);
    if (hasNameAfter) {
      directional = canonical;
      directionalIndex = i;
      break;
    }
  }
  if (!directional && body.length >= 2) {
    const last = DIRECTIONALS[body[body.length - 1]];
    if (last) {
      directional = last;
      directionalIndex = body.length - 1;
    }
  }

  const coreTokens = body
    .filter((_, i) => i !== suffixIndex && i !== directionalIndex)
    .map(reduceOrdinal);
  const core = coreTokens.join(' ');

  const city = normaliseCity(parts.city);
  const state = normaliseState(parts.state);
  const postal = normalisePostal(parts.postal);

  const key = [number ?? '', directional ?? '', core, suffix ?? '', poBox ?? '', city ?? '', state ?? '', postal ?? '']
    .join('|');

  const empty = !number && !core && !poBox && !city && !postal;

  return {
    number, numbers, directional, core, suffix, unit, poBox, city, state, postal,
    key, nameTokens: coreTokens, empty,
  };
}

/**
 * Normalise an address, however it arrived.
 *
 * A string is a printed address off a document; an object is the extraction's
 * `address` block or a facility row. Both land in the same shape, which is what
 * lets a document consignment be compared with a stored facility at all.
 *
 * `line2` is folded into the street line rather than treated as a second
 * address, because a suite is printed in `line1` on one document and `line2` on
 * the next — which is precisely the variant the spec asks this to survive.
 */
export function normaliseAddress(input: AddressInput | string | null | undefined): NormalisedAddress {
  if (input == null) return normaliseParts({ street: '', city: null, state: null, postal: null, unitSegment: null });

  if (typeof input === 'string') return normaliseParts(parseFreeForm(input));

  let line1 = collapse(input.line1 ?? '');
  const line2 = collapse(input.line2 ?? '');

  // A fielded address with nothing but `line1` may still be a whole printed
  // address crammed into one field, which is common in extracted data.
  if (line1 && !input.city && !input.state && !input.postalCode && line1.includes(',')) {
    const parsed = parseFreeForm([line1, line2].filter(Boolean).join(' '));
    return normaliseParts(parsed);
  }

  // The facility-name rule, applied to the fielded shape: `line1` holding a name
  // with no number in it while `line2` holds the street is the same thing as a
  // leading `Midwest Distribution Center,` segment, and must drop for the same
  // reason — the same building is printed with and without it. Tightly gated so
  // an ordinary `line2` unit ("Suite 200") cannot trigger it, because that would
  // throw the street away instead.
  if (line1 && line2 && !tokenise(line1).some(isInteger) && !unitOnlySegment(line1)) {
    const line2HasStreet = tokenise(line2).some(isInteger) && !unitOnlySegment(line2);
    if (line2HasStreet) line1 = '';
  }

  return normaliseParts({
    street: collapse([line1, line2].filter(Boolean).join(' ')),
    city: input.city ?? null,
    state: input.state ?? null,
    postal: input.postalCode ?? null,
    unitSegment: null,
  });
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

/**
 * Are the two unit designations compatible?
 *
 * Absent on one side is compatible — one document printed the dock and the
 * other did not. Two different values are not, and that is the whole difference
 * between "same building" and "two tenants at one address".
 */
export function unitsCompatible(a: NormalisedAddress, b: NormalisedAddress): boolean {
  if (!a.unit || !b.unit) return true;
  return a.unit === b.unit;
}

/**
 * The T2 test: may these two be linked silently, with no human tap?
 *
 * Deliberately stricter than `key` equality — see the file header. An empty
 * address never matches anything, because "we could not read the address" is
 * not evidence of sameness.
 */
export function normalisesEqual(
  a: AddressInput | string | null | undefined,
  b: AddressInput | string | null | undefined,
): boolean {
  const na = normaliseAddress(a);
  const nb = normaliseAddress(b);
  if (na.empty || nb.empty) return false;
  return na.key === nb.key && unitsCompatible(na, nb);
}

/**
 * The same test over already-normalised values, for callers holding both.
 *
 * Named at length rather than `normalisedEqual`, which sat one letter away from
 * `normalisesEqual` above and silently accepted a raw string: `''` has no
 * `.empty` and no `.key`, so `undefined === undefined` came back true and two
 * unreadable addresses matched. Caught by a test, but the names were the defect.
 */
export function normalisedAddressesEqual(a: NormalisedAddress, b: NormalisedAddress): boolean {
  if (a.empty || b.empty) return false;
  return a.key === b.key && unitsCompatible(a, b);
}

/** One line, for the "why" affordance and the T3 candidate list. */
export function formatNormalised(a: NormalisedAddress): string {
  const street = [a.number, a.directional?.toUpperCase(), a.core, a.suffix].filter(Boolean).join(' ');
  const locality = [a.city, [a.state?.toUpperCase(), a.postal].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const unit = a.unit ? ` (unit ${a.unit})` : '';
  const box = a.poBox ? `PO Box ${a.poBox}` : '';
  return [box || street, locality].filter(Boolean).join(', ') + unit;
}
