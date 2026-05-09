import React from 'react';
import { Badge } from '@/components/ui/badge';

interface PlanBadgeProps {
  tier: 'free' | 'starter' | 'pro' | 'business' | 'enterprise';
}

export function PlanBadge({ tier }: PlanBadgeProps) {
  const variantMap: Record<string, React.ComponentProps<typeof Badge>['variant']> = {
    free: 'secondary',
    starter: 'outline',
    pro: 'default',
    business: 'default',
    enterprise: 'default',
  };

  const customClasses: Record<string, string> = {
    business: 'bg-amber-500 hover:bg-amber-600',
    enterprise: 'bg-purple-500 hover:bg-purple-600',
  };

  const variant = variantMap[tier] || 'default';
  const customClass = customClasses[tier] || '';
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <Badge variant={variant} className={customClass}>
      {label}
    </Badge>
  );
}
