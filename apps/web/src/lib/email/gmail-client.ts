/**
 * Gmail SMTP email client via Nodemailer.
 *
 * Environment variables:
 * - GMAIL_USER: Gmail address (e.g. you@gmail.com)
 * - GMAIL_APP_PASSWORD: Google App Password (16 chars, spaces optional)
 */

import nodemailer from 'nodemailer';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { nanoid } from 'nanoid';

// Lazy-initialized transporter singleton
let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!_transporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      throw new Error(
        'GMAIL_USER and GMAIL_APP_PASSWORD environment variables are required.'
      );
    }

    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        // Strip spaces — Google shows App Passwords in groups of 4 for readability
        pass: pass.replace(/\s/g, ''),
      },
    });
  }
  return _transporter;
}

export const FROM_EMAIL =
  process.env.GMAIL_FROM_NAME
    ? `${process.env.GMAIL_FROM_NAME} <${process.env.GMAIL_USER}>`
    : `DriveCommand <${process.env.GMAIL_USER}>`;

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

/**
 * Send an email using Gmail SMTP.
 * Returns { id } compatible with previous Resend-based callers.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const transporter = getTransporter();
  const html = await render(options.react);
  const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;

  await transporter.sendMail({
    from: FROM_EMAIL,
    to: toAddresses,
    subject: options.subject,
    html,
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
  });

  return { id: nanoid() };
}
