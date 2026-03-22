import { getUnreadAdminReplyCount } from '@/actions/support-tickets';

/**
 * Server component that renders the unread admin reply badge for the sidebar.
 * Isolated here so the parent sidebar can remain a client component.
 * Only rendered for OWNER-role users.
 */
export async function SupportBadge() {
  let count = 0;
  try {
    count = await getUnreadAdminReplyCount();
  } catch {
    // Non-blocking — badge simply won't show on error
  }

  if (count <= 0) return null;

  return (
    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
}
