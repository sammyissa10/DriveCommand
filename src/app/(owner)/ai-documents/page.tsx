import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { DocumentAnalyzer } from '@/components/ai-documents/document-analyzer';

export default async function AiDocumentsPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Document Reading</h1>
        <p className="text-muted-foreground mt-1">
          Upload freight documents to automatically extract load data using AI
        </p>
      </div>
      <DocumentAnalyzer />
    </div>
  );
}
