/**
 * First-run navigational tour steps (owner/dispatcher mobile chrome).
 *
 * `target` is a `data-tour` value on a real chrome element, or `null` for a
 * centered intro card with no spotlight. Steps whose target isn't present at
 * runtime (e.g. the "checklist" ribbon on an already-activated tenant) are
 * skipped automatically, keeping the tour at 4–5 visible steps.
 */
export interface TourStep {
  /** `data-tour` attribute value to spotlight, or null for a centered card. */
  target: string | null;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to DriveCommand',
    body: 'A quick 20-second tour of the essentials. You can skip anytime.',
  },
  {
    target: 'create',
    title: 'Create anything',
    body: 'Tap + to add loads, trips, drivers, clients, and more.',
  },
  {
    target: 'tabs',
    title: 'Get around',
    body: 'Switch between Trips, Loads, Dashboard, Live Map, and More down here.',
  },
  {
    target: 'checklist',
    title: 'Finish setup',
    body: 'Your Get started checklist tracks what’s left before you launch.',
  },
  {
    target: 'help',
    title: 'Need a hand?',
    body: 'Tap the ? anytime for guides and support — and to replay this tour.',
  },
];
