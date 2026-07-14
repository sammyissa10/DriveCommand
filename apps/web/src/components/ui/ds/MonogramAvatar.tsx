function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Circular monogram avatar for human/company entities. `ds.avatar` fill, two
 * initials in 600 weight. People get circles, machines get square unit chips.
 */
export function MonogramAvatar({
  name = '',
  initials,
  size = 44,
}: {
  name?: string;
  initials?: string;
  size?: number;
}) {
  const text = initials ?? initialsFrom(name);
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-ds-avatar font-semibold text-ds-initials"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {text}
    </div>
  );
}
