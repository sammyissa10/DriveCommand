import { Phone, MessageSquare, Mail, type LucideIcon } from 'lucide-react';

interface Action {
  key: string;
  icon: LucideIcon;
  label: string;
  href: string;
}

/**
 * Call / Message / Mail cards wired to native deep links (tel:, sms:, mailto:).
 * Only actions with a value render. Reachable with a thumb without scrolling.
 */
export function ContactActionsRow({
  phone,
  email,
}: {
  phone?: string | null;
  email?: string | null;
}) {
  const actions: Action[] = [];
  if (phone) {
    actions.push({ key: 'call', icon: Phone, label: 'Call', href: `tel:${phone}` });
    actions.push({ key: 'sms', icon: MessageSquare, label: 'Message', href: `sms:${phone}` });
  }
  if (email) {
    actions.push({ key: 'mail', icon: Mail, label: 'Mail', href: `mailto:${email}` });
  }
  if (actions.length === 0) return null;

  return (
    <div className="flex gap-3">
      {actions.map(({ key, icon: Icon, label, href }) => (
        <a
          key={key}
          href={href}
          aria-label={label}
          className="flex h-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-[20px] bg-ds-card transition active:opacity-75"
        >
          <Icon className="h-6 w-6 text-ds-accent" />
          <span className="text-[13px] text-ds-txt">{label}</span>
        </a>
      ))}
    </div>
  );
}
