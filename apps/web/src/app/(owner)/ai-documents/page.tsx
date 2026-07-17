import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { DocumentAnalyzer } from '@/components/ai-documents/document-analyzer';
import { AiDocumentsMobile } from '@/components/ai-documents/AiDocumentsMobile';
import { ComingSoonBanner } from '@/components/ui/coming-soon-banner';

const COMING_SOON_MESSAGE =
  'AI document reading requires an active Anthropic API plan. Full availability coming soon.';

export default async function AiDocumentsPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <AiDocumentsMobile comingSoonMessage={COMING_SOON_MESSAGE} />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
        <ComingSoonBanner message={COMING_SOON_MESSAGE} />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Document Reading</h1>
          <p className="text-muted-foreground mt-1">
            Upload freight documents to automatically extract load data using AI
          </p>
        </div>
        <DocumentAnalyzer />
      </div>
    </>
  );
}
