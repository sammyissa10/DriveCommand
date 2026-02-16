import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { listTagsWithAssignments } from '@/app/(owner)/actions/tags';
import { listTrucks } from '@/app/(owner)/actions/trucks';
import { listDrivers } from '@/app/(owner)/actions/drivers';
import { TagManager } from '@/components/tags/tag-manager';
import { TagAssignment } from '@/components/tags/tag-assignment';

export const fetchCache = 'force-no-store';

/**
 * Tags & Groups page
 * Allows OWNER/MANAGER to create tags and assign them to trucks and drivers.
 */
export default async function TagsPage() {
  // Require OWNER or MANAGER role
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Fetch data in parallel
  const [tagsWithAssignments, trucks, drivers] = await Promise.all([
    listTagsWithAssignments(),
    listTrucks(),
    listDrivers(),
  ]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tags & Groups</h1>
        <p className="text-muted-foreground mt-2">
          Organize your fleet with tags for filtering across dashboards
        </p>
      </div>

      {/* Tag Management Section */}
      <TagManager tags={tagsWithAssignments} />

      {/* Tag Assignment Section */}
      <TagAssignment
        tags={tagsWithAssignments}
        trucks={trucks}
        drivers={drivers}
      />
    </div>
  );
}
