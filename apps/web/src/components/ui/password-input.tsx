"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input, type InputProps } from "./input";

/**
 * PasswordInput — password field with a show/hide toggle (eye icon).
 *
 * Self-manages its visibility state and defaults to hidden, so it's a drop-in
 * replacement for `<Input type="password" />` anywhere a password (or
 * confirm-password) field is needed. Icon, position, and behavior match the
 * toggle on the Sign in screen (sign-in-card.tsx).
 */
export type PasswordInputProps = Omit<InputProps, "type">;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={showPassword ? "text" : "password"}
          className={cn("pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-75"
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5" strokeWidth={1.6} strokeLinecap="square" />
          ) : (
            <Eye className="h-5 w-5" strokeWidth={1.6} strokeLinecap="square" />
          )}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
