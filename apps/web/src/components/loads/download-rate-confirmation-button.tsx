'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { generateRateConfirmationPDF } from '@/app/(owner)/actions/rate-confirmation';

interface DownloadRateConfirmationButtonProps {
  loadId: string;
}

export function DownloadRateConfirmationButton({ loadId }: DownloadRateConfirmationButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleDownload() {
    setIsGenerating(true);
    try {
      const { pdf, filename } = await generateRateConfirmationPDF(loadId);

      // Decode base64 to binary
      const binaryString = atob(pdf);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob and trigger download
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate rate confirmation PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={isGenerating}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isGenerating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          Rate Confirmation
        </>
      )}
    </button>
  );
}
