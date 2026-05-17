"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ease } from "@/lib/motion";

interface Tip {
  label: string;
  text: string;
}

const tips: Tip[] = [
  {
    label: "TIP",
    text: "Run the pre-trip checklist before every dispatch. Catches 90% of DOT roadside issues.",
  },
  {
    label: "TIP",
    text: "Tap a load row to open the drawer — your list keeps its place. Press 'j' and 'k' to navigate.",
  },
  {
    label: "TIP",
    text: "Detention starts at the appointment time, not when the driver arrives. Track it from the load detail.",
  },
  {
    label: "TIP",
    text: "Save your most-used lanes as filters. One click to pull up all your I-80 Midwest loads.",
  },
  {
    label: "TIP",
    text: "POD must be uploaded before settlement. Drivers can snap it from the mobile app.",
  },
  {
    label: "TIP",
    text: "HOS warnings appear 2 hours before a violation. Reassign before it costs you the load.",
  },
  {
    label: "TIP",
    text: "Press ⌘K from anywhere to search loads, drivers, customers, or jump to any screen.",
  },
  {
    label: "DID YOU KNOW",
    text: "DriveCommand routes through OSRM with live traffic — ETAs adjust every 60 seconds.",
  },
  {
    label: "SHORTCUT",
    text: "Type 'g d' to jump to Dispatch from anywhere. Like GitHub. Power dispatchers swear by it.",
  },
  {
    label: "DID YOU KNOW",
    text: "Deadhead miles still earn driver share when you flag them — don't lose payable miles.",
  },
];

/**
 * RotatingTips — Domain-correct tips that rotate every 9 seconds.
 * Uses fade + slide animation with proper reduced motion support.
 */
export function RotatingTips() {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Use Framer Motion's hook — handles SSR properly, prevents hydration mismatch
  const prefersReducedMotion = useReducedMotion() ?? false;

  useEffect(() => {
    // 9 seconds gives users time to read two-line tips
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tips.length);
    }, 9000);

    return () => clearInterval(interval);
  }, []);

  const currentTip = tips[currentIndex];

  if (prefersReducedMotion) {
    // Static version for reduced motion
    return (
      <div className="h-24 w-full max-w-sm flex items-center justify-center">
        <div className="rounded-lg border border-white/10 bg-[#131B2E] px-5 py-4 w-full">
          <div className="text-label text-b-300 mb-1.5 uppercase tracking-wider">
            {currentTip.label}
          </div>
          <p className="text-small text-n-200 leading-relaxed">
            {currentTip.text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-24 w-full max-w-sm flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: ease.out }}
          className="rounded-lg border border-white/10 bg-[#131B2E] px-5 py-4 w-full"
        >
          <div className="text-label text-b-300 mb-1.5 uppercase tracking-wider">
            {currentTip.label}
          </div>
          <p className="text-small text-n-200 leading-relaxed">
            {currentTip.text}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
