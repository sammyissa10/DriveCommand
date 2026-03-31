import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0e1a] px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">404</p>
      <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">Page Not Found</h1>
      <p className="mx-auto mt-4 max-w-md text-base text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-110"
      >
        Back to Login
      </Link>
    </div>
  )
}
