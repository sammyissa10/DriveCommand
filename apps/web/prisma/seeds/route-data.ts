/**
 * US Interstate Route Pairs for GPS Trail Generation
 * Real coordinates for major US cities
 */

export interface RoutePair {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  name: string;
}

export const ROUTE_PAIRS: RoutePair[] = [
  // I-5 Corridor (West Coast)
  {
    origin: { lat: 47.6062, lng: -122.3321 }, // Seattle, WA
    destination: { lat: 34.0522, lng: -118.2437 }, // Los Angeles, CA
    name: 'I-5: Seattle to Los Angeles',
  },
  {
    origin: { lat: 37.7749, lng: -122.4194 }, // San Francisco, CA
    destination: { lat: 32.7157, lng: -117.1611 }, // San Diego, CA
    name: 'I-5: San Francisco to San Diego',
  },

  // I-10 Corridor (Southern Route)
  {
    origin: { lat: 34.0522, lng: -118.2437 }, // Los Angeles, CA
    destination: { lat: 29.7604, lng: -95.3698 }, // Houston, TX
    name: 'I-10: Los Angeles to Houston',
  },
  {
    origin: { lat: 33.4484, lng: -112.074 }, // Phoenix, AZ
    destination: { lat: 30.2672, lng: -97.7431 }, // Austin, TX
    name: 'I-10: Phoenix to Austin',
  },

  // I-80 Corridor (Northern Route)
  {
    origin: { lat: 37.7749, lng: -122.4194 }, // San Francisco, CA
    destination: { lat: 41.2565, lng: -95.9345 }, // Omaha, NE
    name: 'I-80: San Francisco to Omaha',
  },
  {
    origin: { lat: 41.8781, lng: -87.6298 }, // Chicago, IL
    destination: { lat: 40.7128, lng: -74.006 }, // New York, NY
    name: 'I-80: Chicago to New York',
  },

  // I-95 Corridor (East Coast)
  {
    origin: { lat: 42.3601, lng: -71.0589 }, // Boston, MA
    destination: { lat: 25.7617, lng: -80.1918 }, // Miami, FL
    name: 'I-95: Boston to Miami',
  },
  {
    origin: { lat: 40.7128, lng: -74.006 }, // New York, NY
    destination: { lat: 33.749, lng: -84.388 }, // Atlanta, GA
    name: 'I-95: New York to Atlanta',
  },

  // I-40 Corridor (Mid-South)
  {
    origin: { lat: 35.4676, lng: -97.5164 }, // Oklahoma City, OK
    destination: { lat: 35.1495, lng: -90.049 }, // Memphis, TN
    name: 'I-40: Oklahoma City to Memphis',
  },
  {
    origin: { lat: 35.2271, lng: -80.8431 }, // Charlotte, NC
    destination: { lat: 36.1627, lng: -86.7816 }, // Nashville, TN
    name: 'I-40: Charlotte to Nashville',
  },
];
