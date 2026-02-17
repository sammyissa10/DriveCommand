"use client";

import { User } from "lucide-react";

export function UserMenu() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
      <User className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}
