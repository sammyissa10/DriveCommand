'use client';
import 'client-only';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@/server/api/root';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
