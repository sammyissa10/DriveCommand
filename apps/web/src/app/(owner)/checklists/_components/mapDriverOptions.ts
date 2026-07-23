/**
 * Pure mapper for StartChecklistDialog's DRIVER entity options (quick-502).
 *
 * The workflow backend contract keys DRIVER entityId on User.id (never
 * CarrierDriver.id) — see generatePlaybookInstance/verifyEntity. A driver
 * whose invite has not been accepted yet has no linked User (userId is
 * null) and must be shown but not selectable, so the dialog never submits
 * a CarrierDriver.id or a fabricated id in place of a real User.id.
 */

export interface DriverOption {
  /** For a linked driver this is the User.id. For a pending driver this is a
   * stable `pending:<CarrierDriver.id>` sentinel — never a real User.id, and
   * disabled, so it can never be submitted as entityId. */
  id: string;
  label: string;
  disabled: boolean;
  hint?: string;
}

export interface DriverOptionInput {
  id: string;
  userId?: string | null;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export function mapDriverOptions(drivers: DriverOptionInput[]): DriverOption[] {
  return drivers.map((d) => {
    const name = d.name ?? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim();

    if (d.userId) {
      return { id: d.userId, label: name || d.userId, disabled: false };
    }

    return {
      id: `pending:${d.id}`,
      label: name || d.id,
      disabled: true,
      hint: 'Invite pending - driver must accept before onboarding',
    };
  });
}
