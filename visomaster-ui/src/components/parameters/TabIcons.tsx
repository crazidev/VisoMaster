/**
 * Custom SVG icons for FaceOptionsPanel tabs.
 * All icons share the same viewBox="0 0 24 24", stroke-based, no fill by default.
 * Pass className to control size/color (e.g. "size-3.5 text-current").
 */

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// ── Face Detector ─────────────────────────────────────────────────────────────
// Bounding-box corners around a face oval + two eye dots
export function DetectorIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* corner brackets */}
      <path d="M3 8V5h3" />
      <path d="M21 8V5h-3" />
      <path d="M3 16v3h3" />
      <path d="M21 16v3h-3" />
      {/* face oval */}
      <ellipse cx="12" cy="12" rx="5" ry="6" />
      {/* eyes */}
      <circle cx="10" cy="11" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14" cy="11" r="0.8" fill="currentColor" stroke="none" />
      {/* mouth */}
      <path d="M10 14.5q2 1.5 4 0" />
    </svg>
  )
}

// ── Face Mask ─────────────────────────────────────────────────────────────────
// Face silhouette with a dashed overlay mask region
export function MaskIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* face outline */}
      <path d="M12 3C8.5 3 6 6 6 9.5v3C6 16.5 8.5 19 12 19s6-2.5 6-6.5v-3C18 6 15.5 3 12 3z" />
      {/* mask overlay — dashed region covering upper face */}
      <path
        d="M7.5 8.5 Q12 6.5 16.5 8.5 L16.5 13 Q12 15 7.5 13 Z"
        strokeDasharray="2 1.5"
        strokeWidth={1.4}
      />
      {/* eye cutouts */}
      <ellipse cx="9.8" cy="10.5" rx="1.2" ry="0.9" />
      <ellipse cx="14.2" cy="10.5" rx="1.2" ry="0.9" />
    </svg>
  )
}

// ── Face Restorer ─────────────────────────────────────────────────────────────
// Face with sparkle / restoration rays emanating from it
export function RestorerIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* face */}
      <ellipse cx="11" cy="13" rx="4.5" ry="5.5" />
      <path d="M9.5 14.8q1.5 1.2 3 0" />
      <circle cx="9.8" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12.2" cy="12" r="0.7" fill="currentColor" stroke="none" />
      {/* sparkle top-right */}
      <path d="M17 4l.6 1.4L19 6l-1.4.6L17 8l-.6-1.4L15 6l1.4-.6z" strokeWidth={1.3} />
      {/* small star */}
      <path d="M19.5 10l.35.8.85.35-.85.35L19.5 12.3l-.35-.8-.85-.35.85-.35z" strokeWidth={1.2} />
    </svg>
  )
}

// ── Swapper ───────────────────────────────────────────────────────────────────
// Two face silhouettes with a bidirectional arrow between them
export function SwapperIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* left face */}
      <ellipse cx="7" cy="10" rx="3" ry="3.5" />
      <path d="M5.5 11.5q1.5 1 3 0" />
      {/* right face */}
      <ellipse cx="17" cy="10" rx="3" ry="3.5" />
      <path d="M15.5 11.5q1.5 1 3 0" />
      {/* swap arrows */}
      <path d="M11 8.5l-1.5-1.5 1.5-1.5" />
      <path d="M13 15.5l1.5 1.5-1.5 1.5" />
      <path d="M9.5 7H14.5" />
      <path d="M9.5 17H14.5" />
    </svg>
  )
}

// ── Face Similarity ───────────────────────────────────────────────────────────
// Two overlapping face ovals with a link / chain between them
export function SimilarityIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* left face */}
      <ellipse cx="8" cy="11" rx="3.5" ry="4" />
      <circle cx="6.8" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <path d="M7 12.5q1 .8 2 0" />
      {/* right face */}
      <ellipse cx="16" cy="11" rx="3.5" ry="4" />
      <circle cx="14.8" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="17.2" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <path d="M15 12.5q1 .8 2 0" />
      {/* link */}
      <path d="M11.5 11h1" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

// ── Face Editor ───────────────────────────────────────────────────────────────
// Face with rotation / pose arc and a small edit pencil
export function EditorIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* face */}
      <ellipse cx="11" cy="13" rx="4.5" ry="5" />
      <circle cx="9.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="12" r="0.7" fill="currentColor" stroke="none" />
      <path d="M9.5 14.8q1.5 1.2 3 0" />
      {/* pose arc */}
      <path d="M6.5 8.5 A6 6 0 0 1 15.5 8.5" strokeDasharray="2 1.5" />
      {/* pencil */}
      <path d="M17 4.5l2.5 2.5-6 6-3 .5.5-3z" strokeWidth={1.3} />
    </svg>
  )
}

// ── Expression Restorer ───────────────────────────────────────────────────────
// Face with animated expression lines (motion curves around mouth/eyes)
export function ExpressionIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* face */}
      <ellipse cx="12" cy="13" rx="5" ry="5.5" />
      {/* expressive eyes — arched */}
      <path d="M9.5 11.2 q.8-.8 1.6 0" />
      <path d="M12.9 11.2 q.8-.8 1.6 0" />
      {/* big smile */}
      <path d="M9 14.5 q3 3 6 0" />
      {/* expression energy lines */}
      <path d="M5.5 9.5 q-.8-1 0-2" strokeWidth={1.2} />
      <path d="M18.5 9.5 q.8-1 0-2" strokeWidth={1.2} />
      <path d="M6.5 13 q-1.2 0-1.5-1" strokeWidth={1.2} />
      <path d="M17.5 13 q1.2 0 1.5-1" strokeWidth={1.2} />
    </svg>
  )
}

// ── Color Correction ──────────────────────────────────────────────────────────
// Face with three overlapping color-channel circles (RGB) on the forehead
export function ColorIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* face */}
      <ellipse cx="12" cy="14" rx="5" ry="5.5" />
      <circle cx="10.5" cy="13" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="13" r="0.7" fill="currentColor" stroke="none" />
      <path d="M10.5 15.8q1.5 1.2 3 0" />
      {/* RGB circles */}
      <circle cx="10.5" cy="6" r="2" strokeWidth={1.3} />
      <circle cx="13.5" cy="6" r="2" strokeWidth={1.3} />
      <circle cx="12" cy="4" r="2" strokeWidth={1.3} />
    </svg>
  )
}

// ── Landmarks Correction ──────────────────────────────────────────────────────
// Face with landmark dots and connecting lines (like a mesh)
export function LandmarksIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* face outline */}
      <ellipse cx="12" cy="12" rx="5.5" ry="6.5" />
      {/* landmark dots */}
      {([
        [12, 6.5], [9, 8.5], [15, 8.5],
        [10, 11], [14, 11], [12, 13],
        [9.5, 15], [12, 16.5], [14.5, 15],
      ] as [number, number][]).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.7" fill="currentColor" stroke="none" />
      ))}
      {/* connecting lines */}
      <path d="M12 6.5L9 8.5L10 11L12 13L14 11L15 8.5L12 6.5" strokeWidth={0.9} />
      <path d="M10 11L9.5 15L12 16.5L14.5 15L14 11" strokeWidth={0.9} />
    </svg>
  )
}

// ── Frame Enhancer ────────────────────────────────────────────────────────────
// Film frame with upward resolution arrows and shine lines
export function EnhancerIcon({ className, ...p }: IconProps) {
  return (
    <svg {...base} className={className} {...p}>
      {/* film frame */}
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <rect x="3" y="7.5" width="2" height="2" rx=".3" fill="currentColor" stroke="none" />
      <rect x="3" y="11" width="2" height="2" rx=".3" fill="currentColor" stroke="none" />
      <rect x="3" y="14.5" width="2" height="2" rx=".3" fill="currentColor" stroke="none" />
      <rect x="19" y="7.5" width="2" height="2" rx=".3" fill="currentColor" stroke="none" />
      <rect x="19" y="11" width="2" height="2" rx=".3" fill="currentColor" stroke="none" />
      <rect x="19" y="14.5" width="2" height="2" rx=".3" fill="currentColor" stroke="none" />
      {/* upscale arrows */}
      <path d="M10 14.5V9.5l-1.5 1.5" />
      <path d="M10 9.5l1.5 1.5" />
      <path d="M14 9.5v5l-1.5-1.5" />
      <path d="M14 14.5l1.5-1.5" />
    </svg>
  )
}
