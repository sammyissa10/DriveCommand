import { parsePrismaSchema } from '@/lib/docs/prisma-parser';
import DatabaseSchemaClient from './DatabaseSchemaClient';

export default function DatabaseSchemaPage() {
  // Parse schema on the server
  const schema = parsePrismaSchema();

  return <DatabaseSchemaClient schema={schema} />;
}
