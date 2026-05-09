import { AutomationClient } from './_components/AutomationClient';

export const dynamic = 'force-dynamic';

export default function AutomationPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Auto-Start Rules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure recipes and custom rules to automatically start checklists when key events happen.
        </p>
      </div>
      <AutomationClient />
    </div>
  );
}
