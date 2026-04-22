import { MessagingPanel } from '@/components/driver/messaging-panel';

export const dynamic = 'force-dynamic';

export default function DriverMessagesPage() {
  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">Fleet Messages</h1>
        <p className="mt-1 text-muted-foreground">
          Secure messaging with dispatch and operations
        </p>
      </div>
      <MessagingPanel />
    </div>
  );
}
