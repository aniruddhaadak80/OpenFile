export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-label="OpenFile" role="img">
      <defs>
        <linearGradient id="ofg" x1="8" y1="6" x2="58" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#FFD27A" /><stop offset=".45" stopColor="#FFB224" /><stop offset="1" stopColor="#E08A00" /></linearGradient>
        <radialGradient id="ofr" cx="32" cy="38" r="14" gradientUnits="userSpaceOnUse"><stop offset=".55" stopColor="#FFB224" stopOpacity=".35" /><stop offset="1" stopColor="#FFB224" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#000" />
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" stroke="url(#ofg)" strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M22 13h14l10 10v25a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V17a4 4 0 0 1 4-4Z" stroke="url(#ofg)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M36 13v8a2 2 0 0 0 2 2h8" stroke="url(#ofg)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="32" cy="38" r="12" fill="url(#ofr)" />
      <circle cx="32" cy="38" r="6.5" stroke="url(#ofg)" strokeWidth="3" />
    </svg>
  )
}

export function Github({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>
}
