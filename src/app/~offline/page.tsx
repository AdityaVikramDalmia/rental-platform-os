"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-amber-100 p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-amber-600"
        >
          <line x1="2" x2="22" y1="2" y2="22" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 12.86a10 10 0 0 1 5.17-2.86" />
          <line x1="12" x2="12.01" y1="20" y2="20" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">You&apos;re offline</h1>
      <p className="max-w-sm text-slate-600 dark:text-slate-400">
        Check your internet connection and try again. The app needs a network connection to load
        fresh data.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-amber-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-amber-600 active:bg-amber-700"
      >
        Try again
      </button>
    </div>
  );
}
