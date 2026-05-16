'use client';

/**
 * RestrictedDocumentDownloadButton
 *
 * Reusable component for downloading restricted PII documents in the owner portal.
 * Wraps the standard download button with:
 * - Access log confirmation dialog (required before fetching the URL)
 * - Role-based disable for insufficiently-privileged roles
 * - ARIA labels for screen readers
 *
 * Wire-up to specific owner pages is deferred to the page authors — this component
 * is created now so future owner UI work can adopt it without rebuilding the logic.
 *
 * NOTE: There is no DISPATCHER role in DriveCommand today (UserRole enum:
 * SYSTEM_ADMIN | OWNER | MANAGER | DRIVER). The `disabled` logic below uses
 * MANAGER+ as the access threshold. When/if a DISPATCHER role is added to
 * UserRole, add it to the `isDisabled` check here explicitly.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Lock, ExternalLink } from 'lucide-react';
import { UserRole } from '@/lib/auth/roles';

interface RestrictedDocumentDownloadButtonProps {
  documentId: string;
  fileName: string;
  isRestricted: boolean;
  /**
   * Current user's role. When provided, used to gate access for insufficient
   * privilege levels. If undefined, assumes the role check is handled server-side
   * and renders the button enabled.
   */
  currentUserRole?: UserRole;
}

/**
 * Returns true when the role is insufficient for restricted document access.
 *
 * RBAC matrix (mirrors restricted-document-access.ts):
 *   - SYSTEM_ADMIN / OWNER / MANAGER → allowed
 *   - DRIVER                          → allowed only for own docs (server enforces; client shows button enabled)
 *   - undefined                       → defer to server
 *
 * TODO: When DISPATCHER role is added to UserRole, add it here as disabled.
 */
function isRoleInsufficient(role: UserRole | undefined): boolean {
  if (!role) return false;
  // Only explicitly privileged roles are allowed client-side
  const privileged: UserRole[] = [UserRole.SYSTEM_ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER];
  return !privileged.includes(role);
}

export function RestrictedDocumentDownloadButton({
  documentId,
  fileName,
  isRestricted,
  currentUserRole,
}: RestrictedDocumentDownloadButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  const isDisabled = isRestricted && isRoleInsufficient(currentUserRole);

  const handleDownload = async () => {
    setIsOpening(true);
    try {
      const response = await fetch(`/api/documents/download-url/${documentId}`);
      if (!response.ok) {
        throw new Error('Failed to get download URL');
      }
      const { downloadUrl } = await response.json();
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Failed to open document:', error);
      alert('Failed to open document. Please try again.');
    } finally {
      setIsOpening(false);
    }
  };

  const handleClick = () => {
    if (isRestricted) {
      setDialogOpen(true);
    } else {
      void handleDownload();
    }
  };

  const button = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isDisabled || isOpening}
      className="shrink-0"
      aria-label={
        isDisabled
          ? `Restricted document ${fileName} — Manager+ access required`
          : isRestricted
            ? `View Restricted document ${fileName}`
            : `View ${fileName}`
      }
    >
      {isOpening ? (
        'Opening...'
      ) : (
        <>
          {isRestricted && <Lock className="h-3 w-3 mr-1" aria-hidden="true" />}
          <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
          View
        </>
      )}
    </Button>
  );

  return (
    <>
      {isDisabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>
              <p>Restricted documents require Manager+ access</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}

      {/* Access log confirmation dialog for restricted documents */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This download will be recorded in the access log.</AlertDialogTitle>
            <AlertDialogDescription>
              A timestamped record of who accessed this document will be created. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleDownload();
                setDialogOpen(false);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
