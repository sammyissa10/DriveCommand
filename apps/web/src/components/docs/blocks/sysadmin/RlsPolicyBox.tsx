import React from 'react';

interface RlsPolicyBoxProps {
  policy: string;
  name?: string;
}

export function RlsPolicyBox({ policy, name }: RlsPolicyBoxProps) {
  return (
    <div className="rounded-lg bg-muted border border-border overflow-hidden my-6">
      {name && (
        <div className="px-4 py-2 border-b border-border bg-muted/50">
          <span className="text-sm font-semibold text-foreground">{name}</span>
        </div>
      )}
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-sm text-foreground whitespace-pre">
          {policy}
        </pre>
      </div>
    </div>
  );
}
