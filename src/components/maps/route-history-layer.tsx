'use client';

import { useEffect, useState } from 'react';
import { Polyline } from 'react-leaflet';
import { getVehicleRouteHistory } from '@/app/(owner)/live-map/actions';

interface RouteHistoryLayerProps {
  truckId: string;
}

interface RoutePoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: Date;
}

interface RouteSegment {
  color: string;
  positions: [number, number][];
}

/**
 * Get color based on speed
 * Blue = slow/stopped, Yellow = moderate, Orange = fast, Red = very fast
 */
function getSpeedColor(speed: number | null): string {
  if (speed === null || speed < 10) return '#3b82f6'; // blue - slow/stopped
  if (speed < 40) return '#eab308'; // yellow - moderate
  if (speed < 60) return '#f97316'; // orange - fast
  return '#ef4444'; // red - very fast
}

/**
 * Group consecutive points into color-coded segments
 * Ensures overlapping points between segments for continuity
 */
function groupIntoSegments(points: RoutePoint[]): RouteSegment[] {
  if (points.length === 0) return [];

  const segments: RouteSegment[] = [];
  let currentSegment: RouteSegment = {
    color: getSpeedColor(points[0].speed),
    positions: [[points[0].latitude, points[0].longitude]],
  };

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const color = getSpeedColor(point.speed);

    if (color === currentSegment.color) {
      // Continue current segment
      currentSegment.positions.push([point.latitude, point.longitude]);
    } else {
      // Color changed - finish current segment and start new one
      // Add current point to both segments for continuity
      currentSegment.positions.push([point.latitude, point.longitude]);
      segments.push(currentSegment);

      // Start new segment with overlapping point
      currentSegment = {
        color,
        positions: [[point.latitude, point.longitude]],
      };
    }
  }

  // Push final segment
  if (currentSegment.positions.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

export default function RouteHistoryLayer({ truckId }: RouteHistoryLayerProps) {
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchRouteHistory() {
      setLoading(true);
      try {
        const history = await getVehicleRouteHistory(truckId, 24);
        if (mounted) {
          setPoints(history);
        }
      } catch (error) {
        console.error('Failed to fetch route history:', error);
        if (mounted) {
          setPoints([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchRouteHistory();

    return () => {
      mounted = false;
    };
  }, [truckId]);

  if (loading || points.length === 0) {
    return null;
  }

  const segments = groupIntoSegments(points);

  return (
    <>
      {segments.map((segment, index) => (
        <Polyline
          key={`segment-${index}`}
          positions={segment.positions}
          pathOptions={{
            color: segment.color,
            weight: 4,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}
    </>
  );
}
