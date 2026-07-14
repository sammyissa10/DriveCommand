function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Circular monogram avatar for human/company entities. `ds.avatar` fill, two
 * initials in 600 weight. People get circles, machines get square unit chips.
 *
 * `warning` renders a small amber compliance dot at the top-right (e.g. an
 * expired/expiring license) — the quick-scan signal on a dispatch list.
 */
export function MonogramAvatar({
  name = '',
  initials,
  size = 44,
  warning = false,
}: {
  name?: string;
  initials?: string;
  size?: number;
  warning?: boolean;
}) {
  const text = initials ?? initialsFrom(name);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-full bg-ds-avatar font-semibold text-ds-initials"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {text}
      </div>
      {warning ? (
        <span className="absolute right-0 top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ds-bg">
          <span className="h-2.5 w-2.5 rounded-full bg-ds-warning" />
        </span>
      ) : null}
    </div>
  );
}
