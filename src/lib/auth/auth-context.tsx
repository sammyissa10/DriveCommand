"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserRole } from './roles';
import type { UserPermissions } from './permissions';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  firstName?: string;
  lastName?: string;
  permissions?: UserPermissions;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
});

/**
 * AuthProvider - Fetches /api/auth/me on mount and provides user context to all children.
 * Wrap in the root layout to make auth available throughout the app.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          setUser(null);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUser({
            id: data.userId,
            email: data.email,
            role: data.role as UserRole,
            tenantId: data.tenantId,
            firstName: data.firstName,
            lastName: data.lastName,
            permissions: data.permissions,
          });
        }
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoaded }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth - Read current user and loading state from AuthContext.
 * Must be used inside a component wrapped by AuthProvider.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
