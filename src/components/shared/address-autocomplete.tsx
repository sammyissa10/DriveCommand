'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface AddressAutocompleteProps {
  id: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Load Google Maps script once globally
let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') return reject();
    if ((window as any).google?.maps?.places) {
      scriptLoaded = true;
      return resolve();
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function AddressAutocomplete({
  id,
  name,
  defaultValue = '',
  required = false,
  disabled = false,
  placeholder = 'Enter address...',
  className = '',
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);
  const [value, setValue] = useState(defaultValue);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return;

    const g = (window as any).google;
    const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) {
        setValue(place.formatted_address);
      }
    });

    autocompleteRef.current = autocomplete;
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;

    loadGoogleMapsScript()
      .then(() => {
        setIsGoogleLoaded(true);
        initAutocomplete();
      })
      .catch(() => {
        // Fall back to plain text input
      });

    return () => {
      autocompleteRef.current = null;
    };
  }, [initAutocomplete]);

  useEffect(() => {
    if (isGoogleLoaded) {
      initAutocomplete();
    }
  }, [isGoogleLoaded, initAutocomplete]);

  return (
    <input
      ref={inputRef}
      type="text"
      id={id}
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={200}
      className={className}
      autoComplete="off"
    />
  );
}
