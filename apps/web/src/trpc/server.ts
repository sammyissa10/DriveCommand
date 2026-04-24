import 'server-only';
import { cache } from 'react';
import { createTRPCContext, createCallerFactory } from '@/server/api/trpc';
import { appRouter } from '@/server/api/root';

const getContext = cache(() =>
  createTRPCContext({ headers: new Headers() }),
);

export const api = createCallerFactory(appRouter)(getContext);
