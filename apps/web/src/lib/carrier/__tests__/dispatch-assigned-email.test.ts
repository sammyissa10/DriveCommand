import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@react-email/render';
import { buildDispatchAssignedEmailData } from '@/lib/carrier/dispatch-assigned-email';
import { DispatchAssignedEmail } from '@/emails/carrier/dispatch-assigned';

// Normalize ICU narrow/no-break spaces so assertions are stable across Node/ICU
// builds (newer ICU inserts U+202F between the time and AM/PM).
const norm = (s: string) => s.replace(/[  ]/g, ' ');

// A load with 2 stops: pickup at one facility, delivery at another.
const LOAD_WITH_TWO_STOPS = {
  stops: [
    {
      sequenceOrder: 2,
      stopType: 'delivery',
      facility: { name: 'Dallas DC', city: 'Dallas' },
    },
    {
      sequenceOrder: 1,
      stopType: 'pickup',
      facility: { name: 'Chicago Warehouse', city: 'Chicago' },
    },
  ],
};

// 8:00 AM America/Chicago on Jul 19, 2026 (CDT = UTC-5) == 13:00 UTC.
const DEPARTURE_UTC = new Date('2026-07-19T13:00:00Z');

function build() {
  return buildDispatchAssignedEmailData({
    dispatchNumber: 'DC-2026-00001',
    scheduledDeparture: DEPARTURE_UTC,
    timezone: 'America/Chicago',
    loads: [LOAD_WITH_TWO_STOPS],
    truckUnitNumber: '101',
    driverPortalUrl: 'https://drivecommand.app/driver/dispatches/abc',
    companyName: 'Acme Freight',
  });
}

describe('buildDispatchAssignedEmailData', () => {
  it('counts Total Stops from the assigned load(s) — 2, not 0', () => {
    expect(build().stopCount).toBe(2);
  });

  it('builds the itinerary in stop order with type, facility, and city', () => {
    const data = build();
    expect(data.stops).toEqual([
      { sequence: 1, type: 'pickup', facilityName: 'Chicago Warehouse', city: 'Chicago' },
      { sequence: 2, type: 'delivery', facilityName: 'Dallas DC', city: 'Dallas' },
    ]);
  });

  it('renders the departure in the tenant timezone with a zone abbreviation (8:00 AM CDT, not 1:00 PM)', () => {
    const departure = norm(build().scheduledDeparture);
    expect(departure).toBe('Jul 19, 2026, 8:00 AM CDT');
    expect(departure).not.toContain('1:00 PM');
  });
});

describe('DispatchAssignedEmail render', () => {
  it('renders stop count of 2, the ordered stop list, and the 8:00 AM CDT departure', async () => {
    const raw = norm(await render(React.createElement(DispatchAssignedEmail, build())));
    // React inserts empty <!-- --> text separators between adjacent nodes; strip
    // them so structural assertions aren't defeated by the separators.
    const html = raw.replace(/<!--.*?-->/g, '');

    // Total Stops = 2
    expect(html).toMatch(/Total Stops:<\/strong>\s*2/);

    // Stop list present, pickup before delivery
    expect(html).toContain('Chicago Warehouse');
    expect(html).toContain('Dallas DC');
    expect(html.indexOf('Chicago Warehouse')).toBeLessThan(html.indexOf('Dallas DC'));
    expect(html).toContain('Pickup');
    expect(html).toContain('Delivery');

    // Departure rendered in tenant zone with abbreviation
    expect(html).toContain('8:00 AM CDT');
    expect(html).not.toContain('1:00 PM');
  });
});
