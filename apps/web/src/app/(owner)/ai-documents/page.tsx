import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { DocumentAnalyzer } from '@/components/ai-documents/document-analyzer';
import { ComingSoonBanner } from '@/components/ui/coming-soon-banner';

export default async function AiDocumentsPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  return (
    <div className="space-y-6">
      <ComingSoonBanner message="AI document reading requires an active Anthropic API plan. Full availability coming soon." />
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Document Reading</h1>
        <p className="text-muted-foreground mt-1">
          Upload freight documents to automatically extract load data using AI
        </p>
      </div>
      <DocumentAnalyzer />
    </div>
  );
}
