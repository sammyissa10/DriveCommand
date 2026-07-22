"use client";

import { memo, useEffect, useState, useMemo, useRef } from "react";
import { motion, useReducedMotion, useAnimation } from "framer-motion";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import usAtlas from "us-atlas/states-10m.json";

// US city coordinates [longitude, latitude]
const CITIES: Record<string, { coords: [number, number]; label: string }> = {
  CHI: { coords: [-87.6298, 41.8781], label: "CHI" },
  DAL: { coords: [-96.797, 32.7767], label: "DAL" },
  ATL: { coords: [-84.388, 33.749], label: "ATL" },
  HOU: { coords: [-95.3698, 29.7604], label: "HOU" },
  LAX: { coords: [-118.2437, 34.0522], label: "LAX" },
  PHX: { coords: [-112.074, 33.4484], label: "PHX" },
  SEA: { coords: [-122.3321, 47.6062], label: "SEA" },
  BOI: { coords: [-116.2146, 43.615], label: "BOI" },
};

// Freight routes
const ROUTES = [
  { from: "CHI", to: "DAL", delay: 0 },
  { from: "ATL", to: "HOU", delay: 0.8 },
  { from: "LAX", to: "PHX", delay: 1.6 },
  { from: "SEA", to: "BOI", delay: 2.4 },
];

interface FreightRouteProps {
  from: [number, number];
  to: [number, number];
  delay: number;
  prefersReducedMotion: boolean;
}

/**
 * FreightRoute — Animated line showing a freight lane with traveling point
 */
function FreightRoute({ from, to, delay, prefersReducedMotion }: FreightRouteProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const controls = useAnimation();

  // Calculate path for a subtle arc
  const midX = (from[0] + to[0]) / 2;
  const midY = Math.min(from[1], to[1]) - 30;
  const pathD = `M ${from[0]} ${from[1]} Q ${midX} ${midY} ${to[0]} ${to[1]}`;

  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [pathD]);

  useEffect(() => {
    if (prefersReducedMotion || pathLength === 0) return;

    // Start the looping animation
    const runAnimation = async () => {
      await controls.start({
        strokeDashoffset: 0,
        transition: { duration: 2, ease: "easeOut", delay },
      });

      // Loop the moving point
      while (true) {
        await controls.start({
          strokeDashoffset: -pathLength,
          transition: { duration: 4, ease: "linear" },
        });
        controls.set({ strokeDashoffset: pathLength });
        await controls.start({
          strokeDashoffset: 0,
          transition: { duration: 2, ease: "easeOut" },
        });
      }
    };

    runAnimation();

    return () => {
      controls.stop();
    };
  }, [controls, delay, pathLength, prefersReducedMotion]);

  return (
    <g>
      {/* Route line - static background */}
      <path
        d={pathD}
        fill="none"
        stroke="#4DA8FF"
        strokeWidth={2.5}
        strokeOpacity={0.85}
      />
      {/* Animated draw-on line */}
      <motion.path
        ref={pathRef}
        d={pathD}
        fill="none"
        stroke="#6BBBFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        initial={
          prefersReducedMotion
            ? {}
            : { strokeDasharray: pathLength, strokeDashoffset: pathLength }
        }
        animate={
          prefersReducedMotion
            ? {}
            : controls
        }
      />
    </g>
  );
}

interface CityNodeProps {
  pos: [number, number];
  label: string;
  delay: number;
  prefersReducedMotion: boolean;
}

/**
 * CityNode — City marker with label and pulse animation
 */
function CityNode({ pos, label, delay, prefersReducedMotion }: CityNodeProps) {
  return (
    <g>
      {/* Glow halo */}
      <motion.circle
        cx={pos[0]}
        cy={pos[1]}
        r={10}
        fill="#4DA8FF"
        opacity={0.5}
        initial={prefersReducedMotion ? { scale: 1 } : { scale: 0, opacity: 0 }}
        animate={prefersReducedMotion ? {} : { scale: 1, opacity: 0.5 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: delay + 1.5 }}
      />
      {/* Outer ring */}
      <motion.circle
        cx={pos[0]}
        cy={pos[1]}
        r={5}
        fill="#4DA8FF"
        opacity={0.8}
        initial={prefersReducedMotion ? {} : { scale: 0 }}
        animate={prefersReducedMotion ? {} : { scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: delay + 1.2 }}
      />
      {/* Inner dot */}
      <motion.circle
        cx={pos[0]}
        cy={pos[1]}
        r={2.5}
        fill="#9DD4FF"
        initial={prefersReducedMotion ? {} : { scale: 0 }}
        animate={prefersReducedMotion ? {} : { scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: delay + 1.4 }}
      />
      {/* City label */}
      <motion.text
        x={pos[0]}
        y={pos[1] - 14}
        textAnchor="middle"
        fill="#9DD4FF"
        fontSize={10}
        fontFamily="var(--font-geist-mono), monospace"
        fontWeight={600}
        initial={prefersReducedMotion ? {} : { opacity: 0 }}
        animate={prefersReducedMotion ? {} : { opacity: 1 }}
        transition={{ duration: 0.4, delay: delay + 1.6 }}
      >
        {label}
      </motion.text>
    </g>
  );
}

interface MovingPointProps {
  from: [number, number];
  to: [number, number];
  delay: number;
  prefersReducedMotion: boolean;
}

/**
 * MovingPoint — Animated point traveling along a route
 */
function MovingPoint({ from, to, delay, prefersReducedMotion }: MovingPointProps) {
  // Calculate the arc path for the point to follow
  const midX = (from[0] + to[0]) / 2;
  const midY = Math.min(from[1], to[1]) - 30;

  // Quadratic bezier position calculation
  const getPosition = (t: number): [number, number] => {
    const x = (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * midX + t * t * to[0];
    const y = (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * midY + t * t * to[1];
    return [x, y];
  };

  // Generate keyframes for the motion path
  const keyframes = Array.from({ length: 21 }, (_, i) => {
    const pos = getPosition(i / 20);
    return pos;
  });

  if (prefersReducedMotion) {
    // Show at midpoint
    const midPos = getPosition(0.5);
    return (
      <g>
        <circle
          cx={midPos[0]}
          cy={midPos[1]}
          r={12}
          fill="#4DA8FF"
          opacity={0.5}
        />
        <circle
          cx={midPos[0]}
          cy={midPos[1]}
          r={4}
          fill="#9DD4FF"
        />
      </g>
    );
  }

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: delay + 2, duration: 0.3 }}
    >
      {/* Glow */}
      <motion.circle
        r={12}
        fill="#4DA8FF"
        opacity={0.5}
        initial={{ cx: from[0], cy: from[1] }}
        animate={{
          cx: keyframes.map(k => k[0]),
          cy: keyframes.map(k => k[1]),
        }}
        transition={{
          duration: 4,
          ease: "linear",
          repeat: Infinity,
          delay: delay + 2,
        }}
      />
      {/* Point */}
      <motion.circle
        r={4}
        fill="#9DD4FF"
        initial={{ cx: from[0], cy: from[1] }}
        animate={{
          cx: keyframes.map(k => k[0]),
          cy: keyframes.map(k => k[1]),
        }}
        transition={{
          duration: 4,
          ease: "linear",
          repeat: Infinity,
          delay: delay + 2,
        }}
      />
    </motion.g>
  );
}

/**
 * FreightMap — US map with animated freight lanes
 *
 * Key design decisions:
 * - SVG-based for crisp rendering and Framer Motion compatibility
 * - US states rendered with thin n-700 strokes (background context)
 * - 4 freight routes with staggered draw-on animation
 * - Moving points travel along routes with glow effect
 * - Wrapped in React.memo to prevent re-renders from parent state
 */
function FreightMapComponent() {
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Render the SVG client-only. The d3-geo Albers projection uses trigonometric
  // Math (sin/cos/sqrt) whose last-ULP results differ between Node's V8 (server)
  // and the browser's V8, so SSR-ing the path `d` strings causes a hydration
  // mismatch. This map is purely decorative (aria-hidden) and fades in anyway,
  // so we skip SSR entirely and mount it after hydration.
  useEffect(() => setMounted(true), []);

  // Handle resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Create projection and path generator
  const projection = useMemo(() => {
    return geoAlbersUsa()
      .scale(dimensions.width * 1.3)
      .translate([dimensions.width / 2, dimensions.height / 2]);
  }, [dimensions]);

  const pathGenerator = useMemo(() => geoPath().projection(projection), [projection]);

  // Convert TopoJSON to GeoJSON features
  const stateFeatures = useMemo(() => {
    const topology = usAtlas as unknown as Topology<{ states: GeometryCollection }>;
    const geoJson = feature(topology, topology.objects.states) as FeatureCollection;
    return geoJson.features;
  }, []);

  // Project city coordinates
  const projectedCities = useMemo(() => {
    const result: Record<string, [number, number]> = {};
    for (const [key, city] of Object.entries(CITIES)) {
      const projected = projection(city.coords);
      if (projected) {
        result[key] = projected as [number, number];
      }
    }
    return result;
  }, [projection]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full">
      {mounted && (
      <svg
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="w-full h-full"
        aria-hidden="true"
        role="presentation"
      >
        {/* State outlines — desaturated light blue for visibility on dark bg */}
        <motion.g
          initial={prefersReducedMotion ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {stateFeatures.map((stateFeature, i) => (
            <path
              key={i}
              d={pathGenerator(stateFeature) || ""}
              fill="none"
              stroke="#5A6B8A"
              strokeWidth={1.25}
              strokeOpacity={0.45}
            />
          ))}
        </motion.g>

        {/* Freight routes */}
        {ROUTES.map((route) => {
          const from = projectedCities[route.from];
          const to = projectedCities[route.to];
          if (!from || !to) return null;

          return (
            <FreightRoute
              key={`${route.from}-${route.to}`}
              from={from}
              to={to}
              delay={route.delay}
              prefersReducedMotion={prefersReducedMotion}
            />
          );
        })}

        {/* Moving points on routes */}
        {ROUTES.map((route) => {
          const from = projectedCities[route.from];
          const to = projectedCities[route.to];
          if (!from || !to) return null;

          return (
            <MovingPoint
              key={`point-${route.from}-${route.to}`}
              from={from}
              to={to}
              delay={route.delay}
              prefersReducedMotion={prefersReducedMotion}
            />
          );
        })}

        {/* City nodes */}
        {ROUTES.flatMap((route) => [
          { city: route.from, delay: route.delay },
          { city: route.to, delay: route.delay },
        ]).map(({ city, delay }, i) => {
          const pos = projectedCities[city];
          if (!pos) return null;
          const cityData = CITIES[city];

          return (
            <CityNode
              key={`${city}-${i}`}
              pos={pos}
              label={cityData.label}
              delay={delay}
              prefersReducedMotion={prefersReducedMotion}
            />
          );
        })}
      </svg>
      )}
    </div>
  );
}

// Memoize to prevent re-renders from parent state changes (e.g., showPassword toggle)
export const FreightMap = memo(FreightMapComponent);
