'use client';

import { useEffect, useRef, useState } from 'react';
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';

/**
 * FacilityAddressSelect — shared facility-vs-manual address control.
 *
 * Used by both the desktop RouteForm and mobile-web RouteCreateMobile for
 * Origin, Destination, and each Stop address field (TKT-0078/0079). Any
 * origin/destination/stop is really a facility, so this renders a native
 * `<select>` of the tenant's CarrierFacility records with an "Enter
 * manually…" escape hatch that reveals the existing AddressAutocomplete
 * free-text input.
 *
 * Submits the SAME FormData field (`name`) either way — a hidden input in
 * facility mode, or the AddressAutocomplete's own input in manual mode — so
 * the createRoute/updateRoute server action contract is completely
 * unchanged.
 */

export interface FacilityOption {
  id: string;
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface Coords {
  lat: number;
  lng: number;
}

interface FacilityAddressSelectProps {
  /** FormData field name for the address STRING (e.g. "origin", "destination", `stops_${idx}_address`) */
  name: string;
  /** Fetched once by the parent form, passed down */
  facilities: FacilityOption[];
  /** Existing address string (edit round-trip); '' for create */
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Applied to BOTH the <select> and the AddressAutocomplete input */
  className?: string;
  onCoordsChange?: (coords: Coords | null) => void;
  /** Lets parent keep its own draft address string in sync (e.g. stop.address) */
  onAddressChange?: (address: string) => void;
}

const MANUAL_VALUE = '__manual__';

/** Compose the address string that gets submitted AND compared for edit round-trip matching. */
export function composeFacilityAddress(f: FacilityOption): string {
  const parts = [f.addressLine1, f.addressLine2, f.city, f.state, f.zip].filter(Boolean);
  const joined = parts.join(', ');
  return joined || f.name;
}

function facilityOptionLabel(f: FacilityOption): string {
  const cityState = [f.city, f.state].filter(Boolean).join(', ');
  return cityState ? `${f.name} — ${cityState}` : f.name;
}

export function FacilityAddressSelect({
  name,
  facilities,
  defaultValue = '',
  required = false,
  disabled = false,
  placeholder = 'Enter address...',
  className = '',
  onCoordsChange,
  onAddressChange,
}: FacilityAddressSelectProps) {
  const [mode, setMode] = useState<'facility' | 'manual'>('facility');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
  const [manualAddress, setManualAddress] = useState<string>(defaultValue);

  const initializedRef = useRef(false);
  const geocodeSeqRef = useRef(0);

  async function applyCoordsForFacility(f: FacilityOption) {
    const seq = ++geocodeSeqRef.current;

    if (f.latitude != null && f.longitude != null) {
      onCoordsChange?.({ lat: f.latitude, lng: f.longitude });
      return;
    }

    // Geocode fallback for facilities with no stored lat/lng
    try {
      const res = await fetch('/api/geocoding/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: composeFacilityAddress(f) }),
      });
      if (!res.ok) {
        if (seq === geocodeSeqRef.current) onCoordsChange?.(null);
        return;
      }
      const data: Array<{ latitude: number; longitude: number }> = await res.json();
      if (seq !== geocodeSeqRef.current) return; // stale response — selection changed since request
      const first = data[0];
      onCoordsChange?.(first ? { lat: first.latitude, lng: first.longitude } : null);
    } catch {
      if (seq === geocodeSeqRef.current) onCoordsChange?.(null);
    }
  }

  // Determine INITIAL mode once `facilities` is available (parent fetches async)
  useEffect(() => {
    if (initializedRef.current) return;

    if (!defaultValue) {
      // Create path — nothing chosen yet
      setMode('facility');
      setSelectedFacilityId('');
      initializedRef.current = true;
      return;
    }

    if (facilities.length === 0) return; // wait for facilities to load before matching

    const match = facilities.find((f) => composeFacilityAddress(f) === defaultValue);
    if (match) {
      setMode('facility');
      setSelectedFacilityId(match.id);
      void applyCoordsForFacility(match);
    } else {
      setMode('manual');
      setSelectedFacilityId(MANUAL_VALUE);
      setManualAddress(defaultValue);
    }
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, defaultValue]);

  // Fallback: if the facilities fetch fails and never populates, don't get stuck showing a
  // blank field for an edit-path defaultValue — fall back to manual mode after a short delay.
  useEffect(() => {
    if (initializedRef.current || !defaultValue) return;
    const timer = setTimeout(() => {
      if (initializedRef.current) return;
      setMode('manual');
      setSelectedFacilityId(MANUAL_VALUE);
      setManualAddress(defaultValue);
      initializedRef.current = true;
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectChange(value: string) {
    if (value === MANUAL_VALUE) {
      const currentFacility =
        selectedFacilityId && selectedFacilityId !== MANUAL_VALUE
          ? facilities.find((f) => f.id === selectedFacilityId)
          : undefined;
      const currentAddr = currentFacility ? composeFacilityAddress(currentFacility) : manualAddress;
      setMode('manual');
      setSelectedFacilityId(MANUAL_VALUE);
      setManualAddress(currentAddr);
      onAddressChange?.(currentAddr);
      onCoordsChange?.(null); // stale facility coords no longer match the (now-editable) address
      return;
    }

    if (value === '') {
      setMode('facility');
      setSelectedFacilityId('');
      onAddressChange?.('');
      onCoordsChange?.(null);
      return;
    }

    const facility = facilities.find((f) => f.id === value);
    if (!facility) return;

    setMode('facility');
    setSelectedFacilityId(value);
    const addr = composeFacilityAddress(facility);
    onAddressChange?.(addr);
    void applyCoordsForFacility(facility);
  }

  const selectedFacility =
    mode === 'facility' && selectedFacilityId
      ? facilities.find((f) => f.id === selectedFacilityId)
      : undefined;
  const hiddenAddressValue = selectedFacility ? composeFacilityAddress(selectedFacility) : '';

  return (
    <div className="space-y-2">
      <select
        value={mode === 'manual' ? MANUAL_VALUE : selectedFacilityId}
        onChange={(e) => handleSelectChange(e.target.value)}
        required={required && mode === 'facility'}
        disabled={disabled}
        className={className}
      >
        <option value="">Select a facility…</option>
        {facilities.map((f) => (
          <option key={f.id} value={f.id}>
            {facilityOptionLabel(f)}
          </option>
        ))}
        <option value={MANUAL_VALUE}>Enter manually…</option>
      </select>

      {mode === 'facility' ? (
        <input type="hidden" name={name} value={hiddenAddressValue} />
      ) : (
        <AddressAutocomplete
          key={`manual-${name}`}
          id={name}
          name={name}
          defaultValue={manualAddress}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          onPlaceSelect={(place) => {
            setManualAddress(place.displayName);
            onAddressChange?.(place.displayName);
            onCoordsChange?.({ lat: place.lat, lng: place.lng });
          }}
        />
      )}
    </div>
  );
}
