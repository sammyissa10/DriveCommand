'use client';

import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';

interface ResetPasswordButtonProps {
  userId: string;
  email: string;
  userName: string;
}

type ModalState = 'idle' | 'loading' | 'success' | 'error';

export function ResetPasswordButton({ userId, email, userName }: ResetPasswordButtonProps) {
  const [open, setOpen] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<ModalState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function handleClose() {
    setOpen(false);
    setShowPasswordInput(false);
    setPassword('');
    setShowPassword(false);
    setState('idle');
    setMessage(null);
    setPasswordError(null);
  }

  async function handleSendReset() {
    setState('loading');
    setMessage(null);
    try {
      const res = await fetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, action: 'send_reset' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Failed to send reset email');
      } else {
        setState('success');
        setMessage(`Reset email sent to ${email}.`);
      }
    } catch {
      setState('error');
      setMessage('An unexpected error occurred.');
    }
  }

  async function handleSetPassword() {
    setPasswordError(null);
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    setState('loading');
    setMessage(null);
    try {
      const res = await fetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, action: 'set_password', password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(data.error || 'Failed to set password');
      } else {
        setState('success');
        setMessage('Password set. Please share the temporary password with the user securely.');
      }
    } catch {
      setState('error');
      setMessage('An unexpected error occurred.');
    }
  }

  const isLoading = state === 'loading';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        Reset Password
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Reset Password</h3>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                Resetting password for <strong className="text-gray-900">{userName}</strong> ({email})
              </p>

              {/* Feedback messages */}
              {state === 'success' && message && (
                <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2">
                  <p className="text-sm text-green-700">{message}</p>
                </div>
              )}
              {state === 'error' && message && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
                  <p className="text-sm text-red-700">{message}</p>
                </div>
              )}

              {state !== 'success' && (
                <>
                  {/* Option A: Send Reset Email */}
                  <div className="rounded-md border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">Option A — Send Reset Email</p>
                    <p className="text-xs text-gray-500">
                      Sends a password reset link to the owner&apos;s email address.
                    </p>
                    <button
                      type="button"
                      onClick={handleSendReset}
                      disabled={isLoading}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                    >
                      {isLoading && !showPasswordInput ? 'Sending...' : 'Send Reset Email'}
                    </button>
                  </div>

                  {/* Option B: Set Temporary Password */}
                  <div className="rounded-md border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">Option B — Set Temporary Password</p>
                    <p className="text-xs text-gray-500">
                      Directly set a new password for the owner (minimum 8 characters).
                    </p>
                    {!showPasswordInput ? (
                      <button
                        type="button"
                        onClick={() => setShowPasswordInput(true)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Set Temporary Password
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              setPasswordError(null);
                            }}
                            placeholder="Enter new password"
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 pr-9 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            tabIndex={-1}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {passwordError && (
                          <p className="text-xs text-red-600">{passwordError}</p>
                        )}
                        <button
                          type="button"
                          onClick={handleSetPassword}
                          disabled={isLoading}
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
                        >
                          {isLoading && showPasswordInput ? 'Setting...' : 'Set Password'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-4 py-3 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {state === 'success' ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
