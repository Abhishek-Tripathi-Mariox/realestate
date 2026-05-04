'use client'

import { cn } from '@/lib/utils'

/**
 * Card with a circular progress ring on the right side, matching modern
 * real-estate dashboard look.
 *
 * Props:
 *  - label: string  — stat label shown above the value
 *  - value: string|number — primary value
 *  - sub: string — secondary line under value
 *  - percent: number 0..100 — fraction of the ring to fill (defaults to 75)
 *  - color: 'indigo'|'orange'|'emerald'|'rose'|'amber'|'sky' — ring color
 *  - Icon: lucide icon component (optional, shown inside ring)
 *  - className: extra classes for the card container
 */
const COLORS = {
  indigo: { ring: 'hsl(240 70% 55%)', track: 'hsl(240 70% 92%)', icon: 'text-indigo-600', bg: 'bg-indigo-50' },
  orange: { ring: 'hsl(24 95% 55%)', track: 'hsl(24 95% 92%)', icon: 'text-orange-600', bg: 'bg-orange-50' },
  emerald: { ring: 'hsl(152 70% 42%)', track: 'hsl(152 70% 92%)', icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  rose: { ring: 'hsl(346 80% 58%)', track: 'hsl(346 80% 94%)', icon: 'text-rose-600', bg: 'bg-rose-50' },
  amber: { ring: 'hsl(38 92% 50%)', track: 'hsl(38 92% 92%)', icon: 'text-amber-600', bg: 'bg-amber-50' },
  sky: { ring: 'hsl(199 89% 48%)', track: 'hsl(199 89% 92%)', icon: 'text-sky-600', bg: 'bg-sky-50' },
}

export function StatCard({
  label,
  value,
  sub,
  percent = 75,
  color = 'indigo',
  Icon,
  className,
}) {
  const palette = COLORS[color] || COLORS.indigo
  const radius = 26
  const stroke = 6
  const size = 72
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = circ - (clamped / 100) * circ

  return (
    <div
      className={cn(
        'group rounded-2xl bg-white border border-slate-200/70 p-5 shadow-soft card-hover',
        className
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 tracking-tight truncate">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-slate-400 truncate">{sub}</p>}
        </div>

        {/* Circular ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
          >
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={palette.track}
              strokeWidth={stroke}
              fill="none"
            />
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={palette.ring}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>
          {Icon && (
            <div
              className={cn(
                'absolute inset-0 m-auto w-8 h-8 rounded-full flex items-center justify-center',
                palette.bg
              )}
              style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            >
              <Icon className={cn('w-4 h-4', palette.icon)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
