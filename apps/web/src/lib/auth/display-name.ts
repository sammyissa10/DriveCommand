/**
 * Accepted input shape for getDisplayName.
 * All fields are optional so the helper works safely with partial or null user objects.
 * `full_name` is included for future-proofing (mirrors a potential DB column) even though
 * the current AuthUser does not expose it.
 */
export type DisplayNameUser = {
  firstName?: string | null;
  lastName?: string | null;
  full_name?: string | null;
  email?: string | null;
};

/**
 * Returns the best available display name for a user, applying this fallback chain:
 *   1. firstName + " " + lastName  — if both are non-empty after trim
 *   2. firstName alone             — if only firstName is non-empty
 *   3. full_name                   — if non-empty
 *   4. email local-part            — everything before "@" if the address contains one
 *   5. full email                  — if present and non-empty
 *   6. "User"                      — safety fallback so callers never receive an empty string
 *
 * Null, undefined, and whitespace-only values are treated as missing at every step.
 */
export function getDisplayName(user: DisplayNameUser | null | undefined): string {
  if (!user) return "User";

  const first = user.firstName?.trim() ?? "";
  const last = user.lastName?.trim() ?? "";

  // 1. First + Last
  if (first && last) return `${first} ${last}`;

  // 2. First alone
  if (first) return first;

  // 3. full_name
  const fullName = user.full_name?.trim() ?? "";
  if (fullName) return fullName;

  // 4. Email local-part
  const email = user.email?.trim() ?? "";
  if (email.includes("@")) {
    const localPart = email.split("@")[0];
    if (localPart) return localPart;
  }

  // 5. Full email (no "@" present, e.g. plain string)
  if (email) return email;

  // 6. Safety fallback
  return "User";
}
