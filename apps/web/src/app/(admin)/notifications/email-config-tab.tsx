'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { updateNotificationEmailConfig } from '@/app/(admin)/actions/notifications';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const schema = z.object({
  fromName: z.string().min(1, 'From name is required'),
  fromEmail: z.string().email('Must be a valid email address'),
  replyTo: z
    .string()
    .email('Must be a valid email address')
    .optional()
    .or(z.literal(''))
    .nullable(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailConfigTabProps {
  initialConfig: {
    id: string;
    fromName: string;
    fromEmail: string;
    replyTo: string | null;
    updatedAt: Date;
  } | null;
  resendConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailConfigTab({ initialConfig, resendConfigured }: EmailConfigTabProps) {
  const [fromName, setFromName] = useState(initialConfig?.fromName ?? '');
  const [fromEmail, setFromEmail] = useState(initialConfig?.fromEmail ?? '');
  const [replyTo, setReplyTo] = useState(initialConfig?.replyTo ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccessMsg('');

    const parsed = schema.safeParse({ fromName, fromEmail, replyTo: replyTo || null });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const result = await updateNotificationEmailConfig({
        fromName: parsed.data.fromName,
        fromEmail: parsed.data.fromEmail,
        replyTo: parsed.data.replyTo || null,
      });

      if (result.success) {
        setSuccessMsg('Email configuration saved successfully.');
      } else {
        setErrors({ form: result.error });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      {/* Credential status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resend API Credentials</CardTitle>
          <CardDescription>
            Email delivery is powered by the Resend API. Configure your API key via environment
            variables on the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resendConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Resend API Key: Configured
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              Resend API Key: Missing
            </span>
          )}
        </CardContent>
      </Card>

      {/* From address form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">From Address</CardTitle>
          <CardDescription>
            Configure the &ldquo;From&rdquo; name and email address used for all outgoing
            notification emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.form && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errors.form}
              </p>
            )}
            {successMsg && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                {successMsg}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fromName">From Name</Label>
              <Input
                id="fromName"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="DriveCommand"
              />
              {errors.fromName && (
                <p className="text-xs text-red-600">{errors.fromName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fromEmail">From Email</Label>
              <Input
                id="fromEmail"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="notifications@drivecommand.com"
              />
              {errors.fromEmail && (
                <p className="text-xs text-red-600">{errors.fromEmail}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="replyTo">Reply-To Email (optional)</Label>
              <Input
                id="replyTo"
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="support@drivecommand.com"
              />
              {errors.replyTo && (
                <p className="text-xs text-red-600">{errors.replyTo}</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              {initialConfig && (
                <p className="text-xs text-gray-400">
                  Last updated: {new Date(initialConfig.updatedAt).toLocaleString()}
                </p>
              )}
              <Button type="submit" disabled={saving} className="ml-auto">
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
