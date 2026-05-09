import React from 'react';
import {
  Info,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
} from 'lucide-react';

interface CalloutProps {
  variant: 'info' | 'tip' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
  title?: string;
}

const VARIANT_CONFIG = {
  info: {
    icon: Info,
    containerClass: 'bg-blue-500/10 border-blue-500/20',
    iconClass: 'text-blue-500',
    role: 'note' as const,
  },
  tip: {
    icon: Lightbulb,
    containerClass: 'bg-amber-500/10 border-amber-500/20',
    iconClass: 'text-amber-500',
    role: 'note' as const,
  },
  success: {
    icon: CheckCircle2,
    containerClass: 'bg-green-500/10 border-green-500/20',
    iconClass: 'text-green-500',
    role: 'note' as const,
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'bg-yellow-500/10 border-yellow-500/20',
    iconClass: 'text-yellow-500',
    role: 'alert' as const,
  },
  danger: {
    icon: AlertOctagon,
    containerClass: 'bg-red-500/10 border-red-500/20',
    iconClass: 'text-red-500',
    role: 'alert' as const,
  },
};

export function Callout({ variant, children, title }: CalloutProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      className={`rounded-lg border p-4 flex gap-3 ${config.containerClass}`}
      role={config.role}
    >
      <Icon className={`flex-shrink-0 h-5 w-5 ${config.iconClass}`} />
      <div className="flex-1">
        {title && (
          <div className="font-semibold text-foreground mb-1">{title}</div>
        )}
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  );
}
