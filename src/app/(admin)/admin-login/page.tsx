import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin-session';
import { LoginForm } from './login-form';

/**
 * /admin/login
 *
 * If the admin is already authenticated, redirect to /admin.
 * Otherwise render the password login form.
 */
export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect('/admin');
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">DriveCommand Admin</h1>
          <p className="mt-2 text-gray-400">Sign in to access the admin portal</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
