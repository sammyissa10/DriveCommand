import * as turf from '@turf/turf';

export interface VehicleLocation {
  id: string;
  truckId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: Date;
  truck: {
    make: string;
    model: string;
    licensePlate: string;
  };
}

/**
 * Calculate map bounds from vehicle positions
 * @param vehicles Array of vehicle locations
 * @returns Leaflet bounds format [[minLat, minLng], [maxLat, maxLng]] or null if empty
 */
export function calculateBounds(
  vehicles: VehicleLocation[]
): [[number, number], [number, number]] | null {
  if (vehicles.length === 0) {
    return null;
  }

  // Create GeoJSON points from vehicle positions
  const points = vehicles.map(v =>
    turf.point([v.longitude, v.latitude])
  );

  // Create feature collection and calculate bbox
  const featureCollection = turf.featureCollection(points);
  const bbox = turf.bbox(featureCollection);

  // Convert turf bbox [minX, minY, maxX, maxY] to Leaflet bounds [[minY, minX], [maxY, maxX]]
  // Note: turf uses [lng, lat], Leaflet uses [lat, lng]
  return [
    [bbox[1], bbox[0]], // [minLat, minLng]
    [bbox[3], bbox[2]], // [maxLat, maxLng]
  ];
}

// US geographic center (Kansas)
export const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];

export const DEFAULT_ZOOM = 5;
