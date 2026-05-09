import React from 'react';

interface KeyboardShortcutProps {
  keys: string;
}

export function KeyboardShortcut({ keys }: KeyboardShortcutProps) {
  const keyParts = keys.split('+');

  return (
    <span className="inline-flex items-center gap-1">
      {keyParts.map((key, index) => (
        <React.Fragment key={index}>
          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded shadow-sm">
            {key.trim()}
          </kbd>
          {index < keyParts.length - 1 && (
            <span className="text-muted-foreground text-xs">+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}
