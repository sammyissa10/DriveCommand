import React from 'react';
import Image from 'next/image';

interface Hotspot {
  x: number;
  y: number;
  label: string;
}

interface ScreenshotProps {
  src: string;
  alt: string;
  caption: string;
  hotspots?: Hotspot[];
}

export function Screenshot({ src, alt, caption, hotspots }: ScreenshotProps) {
  return (
    <figure className="my-6">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 70vw"
        />

        {/* Hotspots */}
        {hotspots?.map((hotspot, index) => (
          <div
            key={index}
            className="absolute w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
            }}
            title={hotspot.label}
          >
            {index + 1}
          </div>
        ))}
      </div>

      <figcaption className="text-sm text-muted-foreground mt-2 text-center">
        {caption}
      </figcaption>
    </figure>
  );
}
