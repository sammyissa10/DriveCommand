'use client';

import { Mail, Phone, Users, FileText, Truck, Bell } from 'lucide-react';

interface Interaction {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  isAutomated: boolean;
  createdAt: Date;
}

const typeIcons: Record<string, any> = {
  EMAIL: Mail,
  PHONE: Phone,
  MEETING: Users,
  NOTE: FileText,
  LOAD_UPDATE: Truck,
  ETA_NOTIFICATION: Bell,
};

const typeColors: Record<string, string> = {
  EMAIL: 'bg-blue-100 text-blue-600',
  PHONE: 'bg-green-100 text-green-600',
  MEETING: 'bg-purple-100 text-purple-600',
  NOTE: 'bg-gray-100 text-gray-600',
  LOAD_UPDATE: 'bg-orange-100 text-orange-600',
  ETA_NOTIFICATION: 'bg-cyan-100 text-cyan-600',
};

export function InteractionTimeline({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No interactions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Activity Timeline
      </h3>
      <div className="space-y-4">
        {interactions.map((interaction) => {
          const Icon = typeIcons[interaction.type] || FileText;
          const colorClass = typeColors[interaction.type] || 'bg-gray-100 text-gray-600';

          return (
            <div key={interaction.id} className="flex gap-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">{interaction.subject}</h4>
                  <div className="flex items-center gap-2">
                    {interaction.isAutomated && (
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
                        Auto
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(interaction.createdAt).toLocaleDateString()} at{' '}
                      {new Date(interaction.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                {interaction.description && (
                  <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                    {interaction.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
