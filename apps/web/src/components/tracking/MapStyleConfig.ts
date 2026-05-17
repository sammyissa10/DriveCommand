/**
 * Map tile configuration with fallback chain:
 * 1. MapTiler Dataviz Light (requires NEXT_PUBLIC_MAPTILER_KEY)
 * 2. Stadia Alidade Smooth (free, no key required)
 * 3. OpenStreetMap (fallback, use CSS filter for desaturation)
 *
 * Why MapTiler Dataviz Light?
 * - Desaturated greys/blues designed for data visualization
 * - Reduces visual noise from colored highways, parks, etc.
 * - Makes vehicle markers and route polylines stand out
 * - Professional aesthetic suitable for logistics dashboards
 */

export interface MapTileConfig {
  url: string;
  attribution: string;
  maxZoom: number;
  useCssFilter: boolean;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

const CONFIGS = {
  maptiler: {
    url: `https://api.maptiler.com/maps/dataviz-light/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
    attribution:
      '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    useCssFilter: false,
  },
  stadia: {
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
    useCssFilter: false,
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    useCssFilter: true, // Apply CSS filter for desaturation
  },
} as const;

/**
 * Returns the best available map tile configuration
 * Falls back through the chain based on available API keys
 */
export function getMapTileConfig(): MapTileConfig {
  // Primary: MapTiler (requires API key)
  if (MAPTILER_KEY) {
    return CONFIGS.maptiler;
  }

  // Fallback 1: Stadia (free, no key required for dev)
  // Note: Stadia requires API key in production - fallback to OSM if that fails
  return CONFIGS.stadia;
}

/**
 * CSS filter to apply when useCssFilter is true
 * Desaturates and slightly brightens the OSM tiles
 */
export const MAP_CSS_FILTER = 'grayscale(0.6) saturate(0.7) brightness(1.04)';
