'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import Anthropic from '@anthropic-ai/sdk';
import { validateFileType, MAX_FILE_SIZE } from '@/lib/storage/validate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedFreightData {
  documentType: 'rate_confirmation' | 'invoice' | 'load_tender' | 'other';
  loadNumber: string | null;
  shipper: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  consignee: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  pickupDate: string | null;
  deliveryDate: string | null;
  commodity: string | null;
  weight: string | null;
  rate: string | null;
  currency: 'USD' | null;
  miles: string | null;
  referenceNumbers: string[];
  specialInstructions: string | null;
}

export type AnalyzeDocumentResult =
  | { success: true; extracted: ExtractedFreightData; fileName: string }
  | { error: string; raw?: string };

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are a freight document parser. Extract structured data from this freight document (rate confirmation, invoice, or load tender).

Return ONLY a valid JSON object with these fields (use null for missing fields):
{
  "documentType": "rate_confirmation" | "invoice" | "load_tender" | "other",
  "loadNumber": string | null,
  "shipper": { "name": string | null, "address": string | null, "city": string | null, "state": string | null },
  "consignee": { "name": string | null, "address": string | null, "city": string | null, "state": string | null },
  "pickupDate": string | null,
  "deliveryDate": string | null,
  "commodity": string | null,
  "weight": string | null,
  "rate": string | null,
  "currency": "USD" | null,
  "miles": string | null,
  "referenceNumbers": string[],
  "specialInstructions": string | null
}

Return only the JSON. No markdown, no explanation.`;

export async function analyzeDocument(formData: FormData): Promise<AnalyzeDocumentResult> {
  try {
    // 1. Auth check — FIRST before any data access
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    // 2. Extract file
    const file = formData.get('file') as File;
    if (!file) {
      return { error: 'No file provided' };
    }

    // 3. Validate size
    if (file.size > MAX_FILE_SIZE) {
      return { error: 'File too large (max 100MB)' };
    }

    // 4. Read magic bytes and validate type
    const buffer = await file.slice(0, 4100).arrayBuffer();
    const validation = await validateFileType(buffer, file.type);
    if (!validation.valid) {
      return { error: validation.error };
    }

    // 5. Convert full file to base64 for Claude
    const fullBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(fullBuffer).toString('base64');
    const mediaType = validation.detectedType as 'application/pdf' | 'image/jpeg' | 'image/png';

    // 6. Initialize Anthropic client
    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: 'ANTHROPIC_API_KEY not configured' };
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 7. Build document block based on media type
    const textBlock: Anthropic.TextBlockParam = {
      type: 'text',
      text: EXTRACTION_PROMPT,
    };

    let documentBlock: Anthropic.ContentBlockParam;

    if (mediaType === 'application/pdf') {
      // PDF: use document block type (requires pdfs-2024-09-25 beta)
      documentBlock = {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      } as Anthropic.ContentBlockParam;
    } else {
      // Image: use standard image block
      documentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/jpeg' | 'image/png',
          data: base64,
        },
      };
    }

    // 8. Call Claude
    // Use beta client for PDF support, standard client for images
    let text = '';

    if (mediaType === 'application/pdf') {
      const pdfResponse = await anthropic.beta.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        betas: ['pdfs-2024-09-25'],
        messages: [
          {
            role: 'user',
            content: [documentBlock, textBlock],
          },
        ],
      });
      const firstBlock = pdfResponse.content[0];
      text = firstBlock.type === 'text' ? firstBlock.text : '';
    } else {
      const imgResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [documentBlock, textBlock],
          },
        ],
      });
      const firstBlock = imgResponse.content[0];
      text = firstBlock.type === 'text' ? firstBlock.text : '';
    }

    // 9. Parse response

    try {
      const extracted = JSON.parse(text) as ExtractedFreightData;
      return { success: true, extracted, fileName: file.name };
    } catch {
      return { error: 'Claude returned unexpected format', raw: text };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Analysis failed' };
  }
}
