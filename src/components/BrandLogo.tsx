import { useId } from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export function BrandLogo({ size = 72, className = '' }: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `p3d-bg-${uid}`;
  const topId = `p3d-top-${uid}`;
  const leftId = `p3d-left-${uid}`;
  const rightId = `p3d-right-${uid}`;
  const nozzleId = `p3d-nozzle-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-label="Logo Print3D Maker"
      role="img"
      className={className}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1B2230" />
          <stop offset="100%" stopColor="#0E121B" />
        </linearGradient>
        <linearGradient id={topId} x1="16" y1="24" x2="48" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7D6B" />
          <stop offset="100%" stopColor="#E54856" />
        </linearGradient>
        <linearGradient id={leftId} x1="14" y1="31" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E04352" />
          <stop offset="100%" stopColor="#B92434" />
        </linearGradient>
        <linearGradient id={rightId} x1="32" y1="31" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A81F2E" />
          <stop offset="100%" stopColor="#76131E" />
        </linearGradient>
        <linearGradient id={nozzleId} x1="25" y1="7" x2="39" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>
      </defs>

      {/* Studio Rounded Tile */}
      <rect width="64" height="64" rx="15" fill={`url(#${bgId})`} />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="13.5"
        stroke="#2D374B"
        strokeWidth="1.5"
      />

      {/* Subtle 3D Print Bed Grid Perspective */}
      <path
        d="M9 48.5L32 57.5L55 48.5"
        stroke="#263042"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 44.5L32 51.5L49 44.5"
        stroke="#202838"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Extruder Printhead & Nozzle */}
      <rect x="24" y="7" width="16" height="6.5" rx="2.5" fill={`url(#${nozzleId})`} />
      <rect x="28" y="13.5" width="8" height="3" rx="1" fill="#64748B" />
      <path d="M28.5 16.5H35.5L33.1 21.4H30.9L28.5 16.5Z" fill="#F59E0B" />

      {/* Isometric 3D Printed Cube (Layered Extrusion) */}
      <path d="M32 26.4L48 33.8L32 41.2L16 33.8L32 26.4Z" fill={`url(#${topId})`} />
      <path d="M16 33.8L32 41.2V54.8L16 47.4V33.8Z" fill={`url(#${leftId})`} />
      <path d="M48 33.8L32 41.2V54.8L48 47.4V33.8Z" fill={`url(#${rightId})`} />

      {/* Molten Filament Strand & Extruded Bead on Top Face */}
      <path d="M32 21.4V32.6" stroke="#FF7D6B" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="32" cy="33.4" rx="2.8" ry="1.45" fill="#FFE4E6" />

      {/* Crisp Layer Lines & Highlight Edge */}
      <path
        d="M17.2 38.4L32 45.2L46.8 38.4"
        stroke="#111620"
        strokeOpacity="0.28"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.2 42.9L32 49.7L46.8 42.9"
        stroke="#111620"
        strokeOpacity="0.28"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 41.2V54.8"
        stroke="#FFE4E6"
        strokeOpacity="0.35"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
