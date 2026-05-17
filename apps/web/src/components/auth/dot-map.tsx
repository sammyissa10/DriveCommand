"use client";

import { useRef, useEffect, useCallback } from "react";

interface Route {
  start: { x: number; y: number };
  end: { x: number; y: number };
  progress: number;
}

/**
 * DotMap — Animated canvas-based dot map showing freight routes.
 *
 * Uses brand tokens:
 * - Dot color: n-400 Silver at 30-50% opacity
 * - Route line: b-500 Brand Blue
 * - Moving point glow: b-300 Air with b-400 halo
 * - Background gradient: n-900 Ink to n-800 Slate
 */
export function DotMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const routesRef = useRef<Route[]>([]);

  // Brand colors from BRAND_GUIDE.md
  const colors = {
    dotBase: "rgba(134, 134, 139, 0.35)", // n-400 Silver at 35% opacity
    dotHighlight: "rgba(134, 134, 139, 0.5)", // n-400 at 50% for continents
    routeLine: "#0066CC", // b-500 Brand Blue
    movingPoint: "#5AC8FA", // b-300 Air
    movingHalo: "#2D8FE0", // b-400 for glow
  };

  // World map dot positions (simplified North America, Europe, parts of Asia)
  const generateWorldDots = useCallback((width: number, height: number) => {
    const dots: { x: number; y: number; isContinent: boolean }[] = [];
    const spacing = 12;

    // Simple continent shapes using relative coordinates
    const continents = [
      // North America
      { xMin: 0.08, xMax: 0.32, yMin: 0.15, yMax: 0.55 },
      // Europe
      { xMin: 0.42, xMax: 0.58, yMin: 0.12, yMax: 0.38 },
      // Asia
      { xMin: 0.55, xMax: 0.88, yMin: 0.1, yMax: 0.5 },
      // South America hint
      { xMin: 0.18, xMax: 0.32, yMin: 0.55, yMax: 0.85 },
    ];

    for (let x = spacing; x < width; x += spacing) {
      for (let y = spacing; y < height; y += spacing) {
        const relX = x / width;
        const relY = y / height;

        const isContinent = continents.some(
          (c) =>
            relX >= c.xMin && relX <= c.xMax && relY >= c.yMin && relY <= c.yMax
        );

        // Add random variation for natural look
        if (Math.random() > (isContinent ? 0.3 : 0.85)) {
          dots.push({
            x: x + (Math.random() - 0.5) * 4,
            y: y + (Math.random() - 0.5) * 4,
            isContinent,
          });
        }
      }
    }

    return dots;
  }, []);

  // Initialize routes with staggered delays
  const initRoutes = useCallback((width: number, height: number) => {
    const routeConfigs = [
      // LA to NY
      {
        start: { x: 0.12, y: 0.35 },
        end: { x: 0.28, y: 0.28 },
      },
      // Chicago to Miami
      {
        start: { x: 0.22, y: 0.3 },
        end: { x: 0.26, y: 0.48 },
      },
      // London to Beijing
      {
        start: { x: 0.48, y: 0.22 },
        end: { x: 0.78, y: 0.32 },
      },
      // Tokyo to Singapore
      {
        start: { x: 0.82, y: 0.3 },
        end: { x: 0.72, y: 0.52 },
      },
    ];

    return routeConfigs.map((config, i) => ({
      start: { x: config.start.x * width, y: config.start.y * height },
      end: { x: config.end.x * width, y: config.end.y * height },
      progress: -i * 0.25, // Staggered start
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle resize
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const dots = generateWorldDots(canvas.offsetWidth, canvas.offsetHeight);
    routesRef.current = initRoutes(canvas.offsetWidth, canvas.offsetHeight);

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const animate = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Clear with gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#1D1D1F"); // n-900 Ink
      gradient.addColorStop(1, "#2C2C2E"); // n-800 Slate
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw dots
      dots.forEach((dot) => {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.isContinent ? 1.5 : 1, 0, Math.PI * 2);
        ctx.fillStyle = dot.isContinent
          ? colors.dotHighlight
          : colors.dotBase;
        ctx.fill();
      });

      // Draw routes
      routesRef.current.forEach((route) => {
        // Draw route line
        ctx.beginPath();
        ctx.moveTo(route.start.x, route.start.y);

        // Curved path
        const midX = (route.start.x + route.end.x) / 2;
        const midY = Math.min(route.start.y, route.end.y) - 40;
        ctx.quadraticCurveTo(midX, midY, route.end.x, route.end.y);

        ctx.strokeStyle = `${colors.routeLine}40`; // 25% opacity
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Animate progress only if motion is allowed
        if (!prefersReducedMotion) {
          route.progress += 0.004;
          if (route.progress > 1.3) route.progress = -0.3;
        } else {
          route.progress = 0.5; // Static position
        }

        // Draw moving point
        if (route.progress >= 0 && route.progress <= 1) {
          const t = route.progress;
          const x =
            (1 - t) * (1 - t) * route.start.x +
            2 * (1 - t) * t * midX +
            t * t * route.end.x;
          const y =
            (1 - t) * (1 - t) * route.start.y +
            2 * (1 - t) * t * midY +
            t * t * route.end.y;

          // Outer glow
          const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 12);
          glowGradient.addColorStop(0, `${colors.movingHalo}80`);
          glowGradient.addColorStop(1, `${colors.movingHalo}00`);
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fillStyle = glowGradient;
          ctx.fill();

          // Inner point
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = colors.movingPoint;
          ctx.fill();
        }

        // Draw endpoints
        [route.start, route.end].forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = `${colors.routeLine}60`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = colors.routeLine;
          ctx.fill();
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [generateWorldDots, initRoutes, colors]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
      role="presentation"
    />
  );
}
