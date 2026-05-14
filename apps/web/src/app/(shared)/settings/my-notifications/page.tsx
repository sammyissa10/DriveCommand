export const dynamic = 'force-dynamic';

import { getMyPreferences } from '@/app/(owner)/actions/my-notifications';
import { PreferencesForm } from './preferences-form';

export default async function MyNotificationsPage() {
  const preferences = await getMyPreferences();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Notification Preferences</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose how you want to be notified for each event.
        </p>
      </div>

      <PreferencesForm initialPreferences={preferences} />
    </div>
  );
}
