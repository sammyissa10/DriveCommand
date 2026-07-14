'use client';

/** Group header: 12 Semibold UPPERCASE +0.8 tracking, with an optional action. */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  /** Optional trailing text action, e.g. "See all". */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between px-1 pb-2">
      <span className="text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2">
        {title}
      </span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="text-[13px] text-ds-accent transition active:opacity-75"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
