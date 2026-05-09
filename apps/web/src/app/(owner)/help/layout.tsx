import { HelpSearch } from '@/components/help/HelpSearch';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Help Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Learn how to use DriveCommand features
          </p>
        </div>
        <div className="w-full sm:w-72">
          <HelpSearch />
        </div>
      </div>
      {children}
    </div>
  );
}
