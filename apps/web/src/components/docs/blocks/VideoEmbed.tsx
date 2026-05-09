import React from 'react';

interface VideoEmbedProps {
  url: string;
  title: string;
  captions?: string;
}

function getEmbedUrl(url: string): { type: 'youtube' | 'loom' | 'mp4'; embedUrl: string } {
  // YouTube detection
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    let videoId = '';
    if (url.includes('youtube.com/watch')) {
      const urlParams = new URLSearchParams(url.split('?')[1]);
      videoId = urlParams.get('v') || '';
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    }
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  }

  // Loom detection
  if (url.includes('loom.com')) {
    const videoId = url.split('/share/')[1]?.split('?')[0] || '';
    return {
      type: 'loom',
      embedUrl: `https://www.loom.com/embed/${videoId}`,
    };
  }

  // Assume MP4
  return {
    type: 'mp4',
    embedUrl: url,
  };
}

export function VideoEmbed({ url, title, captions }: VideoEmbedProps) {
  const { type, embedUrl } = getEmbedUrl(url);

  return (
    <div className="my-6">
      {captions && <span className="sr-only">{captions}</span>}

      {type === 'mp4' ? (
        <video
          controls
          preload="metadata"
          className="w-full aspect-video rounded-lg border border-border"
        >
          <source src={embedUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border">
          <iframe
            src={embedUrl}
            title={title}
            className="absolute inset-0 w-full h-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}
