/**
 * Rounded-square unit chip for vehicles — machines get squares, people get
 * circles. `ds.avatar` fill, tiny UNIT eyebrow over the number. The number is
 * single-line and length-aware so short units read big and long ones stay tidy.
 */
export function UnitChip({ number, size = 44 }: { number: string; size?: number }) {
  const len = number.length;
  const fontSize = len <= 3 ? Math.round(size * 0.32) : len <= 5 ? 12 : 10;
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 flex-col items-center justify-center rounded-[12px] bg-ds-avatar px-1"
    >
      <span className="text-[8px] font-semibold uppercase leading-none tracking-[0.6px] text-ds-txt3">
        Unit
      </span>
      <span
        style={{ fontSize, maxWidth: size - 6 }}
        className="mt-0.5 w-full truncate text-center font-bold leading-tight text-ds-initials"
      >
        {number}
      </span>
    </div>
  );
}
