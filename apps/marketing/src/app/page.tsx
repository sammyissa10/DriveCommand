import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DriveCommand — Fleet Management Built for Operators',
  description:
    'Stop managing spreadsheets. DriveCommand gives owner operators and small carriers a single platform for dispatch, tracking, compliance, and growth — without enterprise pricing.',
  openGraph: {
    title: 'DriveCommand — Fleet Management Built for Operators',
    description:
      'A single platform for dispatch, tracking, compliance, and growth — without enterprise pricing.',
  },
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-5xl font-bold text-white mb-4">
          DriveCommand
        </h1>
        <p className="font-body text-lg text-slate-400">
          Fleet management built for the operators who actually drive.
        </p>
      </div>
    </main>
  )
}
