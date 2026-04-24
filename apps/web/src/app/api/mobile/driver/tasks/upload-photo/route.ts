import { NextRequest, NextResponse } from 'next/server'
import { withMobileAuth } from '@/lib/api/with-mobile-auth'
import { generateUploadUrl } from '@/lib/storage/presigned'
import { nanoid } from 'nanoid'
import { logger } from '@/lib/logger'

/**
 * POST /api/mobile/driver/tasks/upload-photo
 *
 * Generates a presigned R2 upload URL for an inspection fail photo.
 * Mobile uploads directly to R2 using the returned uploadUrl.
 * Include the s3Key in the fail API call.
 *
 * Body: { fileName: string, contentType: string, sizeBytes: number }
 * Returns: { uploadUrl: string, s3Key: string }
 *
 * Requires: Authorization: Bearer <token> (DRIVER role)
 */
export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const { tenantId } = auth

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { fileName, contentType, sizeBytes } = body as Record<string, unknown>

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }
    if (!contentType || typeof contentType !== 'string') {
      return NextResponse.json({ error: 'contentType is required' }, { status: 400 })
    }
    if (!sizeBytes || typeof sizeBytes !== 'number') {
      return NextResponse.json({ error: 'sizeBytes must be a number' }, { status: 400 })
    }

    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'contentType must be image/jpeg or image/png' },
        { status: 400 }
      )
    }

    const MAX_SIZE = 10 * 1024 * 1024
    if (sizeBytes > MAX_SIZE) {
      return NextResponse.json({ error: 'Photo size must be 10MB or less' }, { status: 400 })
    }

    try {
      const fileId = nanoid()
      const sanitized = fileName.replace(/[/\\]/g, '-')
      const { uploadUrl, s3Key } = await generateUploadUrl(
        tenantId,
        'inspections',
        fileId,
        sanitized,
        contentType,
        sizeBytes
      )
      return NextResponse.json({ uploadUrl, s3Key })
    } catch (err) {
      logger.error('[mobile/driver/tasks/upload-photo] error:', err)
      return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
    }
  },
  { allowedRoles: ['DRIVER'] }
)
