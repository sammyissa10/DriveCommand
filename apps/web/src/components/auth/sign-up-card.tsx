'use client';

import { memo } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

import { FreightMap } from './freight-map';
import { RotatingTips } from './rotating-tips';
import { ease } from '@/lib/motion';
import { SignUpForm } from '@/app/(auth)/sign-up/sign-up-form';

/**
 * SignUpCard — two-panel signup experience, matching SignInCard.
 *
 * Left panel (desktop only): DriveCommand brand block, animated freight map, and
 * rotating tips. Right panel: brand block (mobile), heading, and the 2-step
 * signup wizard. All motion respects prefers-reduced-motion. The wizard logic and
 * the server action are unchanged — this is the dark, branded shell around them.
 */
export function SignUpCard({
  searchParams,
}: {
  searchParams: Promise<{ promo?: string }>;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const v = (delay: number, y = 12) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, ease: ease.out, delay },
        };

  const cardVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.98 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.4, ease: ease.out },
      };
  const mapVariants = prefersReducedMotion
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, ease: ease.out, delay: 0.2 } };

  return (
    <motion.div
      {...cardVariants}
      className="w-screen h-dvh min-h-dvh bg-[#0E172A] overflow-hidden flex"
    >
      {/* Left Panel — brand, map, tips (hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 flex-col min-h-0 overflow-hidden bg-[#0E172A]">
        <div className="flex-shrink-0 flex flex-col items-center pt-12 pb-6 px-8">
          <motion.div {...v(0.15)} className="flex flex-row items-center gap-3">
            <Image
              src="/brand/drivecommand-mark-mono-light.svg"
              alt="DriveCommand"
              width={56}
              height={56}
              priority
            />
            <h1 className="text-2xl font-bold text-white tracking-tight">DriveCommand</h1>
          </motion.div>
          <motion.h2
            {...v(0.25)}
            className="mt-3 text-h2 font-display font-semibold text-white tracking-tight text-center"
          >
            Miles <span className="text-b-300">Ahead.</span>
          </motion.h2>
        </div>

        <motion.div {...mapVariants} className="flex-1 min-h-0 relative overflow-hidden">
          <div className="absolute inset-0 w-full h-full">
            <MemoizedFreightMap />
          </div>
        </motion.div>

        <div className="flex-shrink-0 px-8 py-6">
          <motion.div {...v(0.5)} className="w-full max-w-sm mx-auto">
            <RotatingTips />
          </motion.div>
        </div>
      </div>

      {/* Right Panel — Sign Up wizard */}
      <div className="w-full md:w-1/2 min-h-dvh md:min-h-0 flex items-center justify-center px-6 py-8 md:p-12 lg:p-16 bg-[#0E1424] md:border-l md:border-[#1C2536] overflow-auto">
        <div className="w-full max-w-md flex flex-col">
          {/* Mobile branding block (left panel is hidden on mobile) */}
          <motion.div {...v(0.15)} className="flex flex-col items-center mb-8 md:hidden">
            <div className="flex flex-row items-center gap-2">
              <Image
                src="/brand/drivecommand-mark-mono-light.svg"
                alt="DriveCommand"
                width={36}
                height={36}
              />
              <span className="text-xl font-bold text-white tracking-tight">DriveCommand</span>
            </div>
            <p className="mt-2 text-lg font-semibold text-white tracking-tight text-center">
              Miles <span className="text-b-300">Ahead.</span>
            </p>
          </motion.div>

          <motion.div {...v(0.3)}>
            <h1 className="text-h1 text-white mb-2 text-center md:text-left">
              Start your free trial
            </h1>
          </motion.div>
          <motion.p {...v(0.35)} className="text-body text-n-400 mb-10 text-center md:text-left">
            No credit card required. 14-day trial included.
          </motion.p>

          <motion.div {...v(0.4)}>
            <SignUpForm searchParams={searchParams} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// Memoized map to prevent re-renders from form state changes.
const MemoizedFreightMap = memo(FreightMap);
