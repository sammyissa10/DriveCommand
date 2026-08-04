/**
 * The contract step must never be a screen with nothing on it to press.
 *
 * Rendered to static markup — no DOM, no interaction. What is being checked is
 * what the dispatcher is given: the empty picker has to carry a create action,
 * and it must not say the same sentence twice, which is exactly what the live
 * walkthrough found ("…has no active contract. This client has no active
 * contract.") with no way forward under it.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractDecision } from '../ContractDecision';
import type { ContractSlotView } from '@/lib/document-import/resolution';

const CLIENT = 'DEALER TIRE - CHICAGO WHSE';

function slot(over: Partial<ContractSlotView> = {}): ContractSlotView {
  return {
    state: 'UNRESOLVED',
    value: null,
    why: null,
    candidates: [],
    spotOffer: null,
    createOffer: null,
    blockedReason: null,
    ...over,
  };
}

/** The shape `resolution.ts` produces for a client with no contracts. */
const ZERO_CONTRACTS = slot({
  createOffer: {
    clientName: CLIENT,
    detail:
      'A trip is billed against a contract. Create one here and the import carries on with it — its rate and terms can be filled in on the contract afterwards.',
  },
});

function render(s: ContractSlotView) {
  return renderToStaticMarkup(
    <ContractDecision importId="import-1" slot={s} clientName={CLIENT} onResolved={() => {}} />,
  );
}

describe('ContractDecision with no contracts to pick', () => {
  it('renders a create action', () => {
    const html = render(ZERO_CONTRACTS);

    expect(html).toContain(`Create a contract for ${CLIENT}`);
    expect(html).toContain('Create and use');
    // Pre-filled with what extraction offers and nothing else: the client is
    // named above, and the only field is the optional name.
    expect(html).toContain('Name it (optional)');
    expect(html).not.toContain('Flat rate from the document');
  });

  it('does not send the user somewhere else to do it', () => {
    const html = render(ZERO_CONTRACTS);
    expect(html).not.toMatch(/Add one on the client/i);
    expect(html).not.toMatch(/web portal/i);
  });

  it('states the situation once', () => {
    const html = render(ZERO_CONTRACTS);
    const occurrences = html.match(/has no active contract/gi) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('leaves the one-time contract to rate confirmations', () => {
    const html = render(ZERO_CONTRACTS);
    expect(html).not.toContain('Create one-time contract');
  });
});

describe('ContractDecision for a rate confirmation with no contracts', () => {
  it('offers the one-time contract and not the standing one', () => {
    const html = render(
      slot({
        spotOffer: {
          totalRate: '1850.00',
          currency: 'USD',
          effectiveDate: '2026-07-27',
          proposedName: 'One-time — RC 4821 (2026-07-27)',
          detail: 'A rate confirmation is an agreement for one trip.',
        },
      }),
    );

    expect(html).toContain('Create one-time contract');
    expect(html).not.toContain('Create a contract for');
  });
});

describe('ContractDecision with contracts to pick', () => {
  const WITH_OPTIONS = slot({
    candidates: [
      {
        id: 'contract-a',
        contractNumber: 'CN-2026-00001',
        contractName: 'Chicago lane',
        contractType: 'contract',
        rateType: 'per_mile',
        baseRate: '2.4000',
        effectiveDate: null,
        expirationDate: null,
        isOneTime: false,
      },
    ],
    createOffer: {
      clientName: CLIENT,
      detail:
        'If none of these is the agreement this load moved under, create the one that is — its rate and terms can be filled in on the contract afterwards.',
    },
  });

  it('offers the options and a create path under them', () => {
    const html = render(WITH_OPTIONS);

    expect(html).toContain('Chicago lane');
    expect(html).toContain(`None of these? Create a contract for ${CLIENT}`);
    // A picker whose every option is the wrong agreement is as much of a dead
    // end as an empty one, so the escape hatch is here too — but under the
    // options, which are still the likely answer.
    expect(html.indexOf('Chicago lane')).toBeLessThan(html.indexOf('None of these?'));
    expect(html).not.toContain('Create one-time contract');
  });
});
