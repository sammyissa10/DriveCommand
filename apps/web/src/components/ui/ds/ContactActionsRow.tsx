import { Phone, MessageSquare, Mail, type LucideIcon } from 'lucide-react';

interface Action {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Native deep link, or null when the channel isn't on file (disabled). */
  href: string | null;
}

/**
 * Call / Message / Mail cards wired to native deep links (tel:, sms:, mailto:).
 * Reachable with a thumb without scrolling.
 *
 * By default only actions with a value render (and nothing shows if there are
 * none). Pass `alwaysShow` for person entities (drivers) where the row is part
 * of the identity: all three render, and a channel that isn't on file appears
 * muted + disabled — a calm prompt to add it, rather than a missing section.
 */
export function ContactActionsRow({
  phone,
  email,
  alwaysShow = false,
}: {
  phone?: string | null;
  email?: string | null;
  alwaysShow?: boolean;
}) {
  const all: Action[] = [
    { key: 'call', icon: Phone, label: 'Call', href: phone ? `tel:${phone}` : null },
    { key: 'sms', icon: MessageSquare, label: 'Message', href: phone ? `sms:${phone}` : null },
    { key: 'mail', icon: Mail, label: 'Mail', href: email ? `mailto:${email}` : null },
  ];
  const actions = alwaysShow ? all : all.filter((a) => a.href);
  if (actions.length === 0) return null;

  return (
    <div className="flex gap-3">
      {actions.map(({ key, icon: Icon, label, href }) =>
        href ? (
          <a
            key={key}
            href={href}
            aria-label={label}
            className="flex h-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-[20px] bg-ds-card transition active:opacity-75"
          >
            <Icon className="h-6 w-6 text-ds-accent" />
            <span className="text-[13px] text-ds-txt">{label}</span>
          </a>
        ) : (
          <div
            key={key}
            aria-disabled
            className="flex h-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-[20px] bg-ds-card opacity-40"
          >
            <Icon className="h-6 w-6 text-ds-txt3" />
            <span className="text-[13px] text-ds-txt3">{label}</span>
          </div>
        ),
      )}
    </div>
  );
}
