import React from 'react';
import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  language?: string;
  children: string;
  copyable?: boolean;
}

export function CodeBlock({
  language,
  children,
  copyable = true,
}: CodeBlockProps) {
  return (
    <div className="relative rounded-lg bg-muted border border-border overflow-hidden my-6">
      {/* Header bar */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-border bg-muted/50">
        {language ? (
          <span className="text-xs text-muted-foreground uppercase font-semibold">
            {language}
          </span>
        ) : (
          <span />
        )}
        {copyable && <CopyButton text={children} />}
      </div>

      {/* Code area */}
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-sm text-foreground whitespace-pre">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}
