'use client';

import dynamic from 'next/dynamic';

const TrackingMapDynamic = dynamic(
  () => import('./tracking-map'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] bg-muted rounded-lg animate-pulse" />
    ),
  }
);

interface TrackingMapWrapperProps {
  latitude: number;
  longitude: number;
  truckLabel: string;
}

export default function TrackingMapWrapper(props: TrackingMapWrapperProps) {
  return <TrackingMapDynamic {...props} />;
}
