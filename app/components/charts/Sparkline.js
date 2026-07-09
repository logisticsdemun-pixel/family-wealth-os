'use client'

export default function Sparkline({ points = [], positiveColor = 'var(--color-positive)', height = 30 }) {
  if (points.length < 2) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 100
  const h = height

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - ((p - min) / range) * (h - 2) - 1
    return [x, y]
  })

  const isPositive = points[points.length - 1] >= points[0]
  const lineColor = isPositive ? positiveColor : 'var(--color-negative)'

  const polyPoints = coords.map(([x, y]) => `${x},${y}`).join(' ')

  const fillPath = [
    `M ${coords[0][0]},${h}`,
    ...coords.map(([x, y]) => `L ${x},${y}`),
    `L ${coords[coords.length - 1][0]},${h}`,
    'Z',
  ].join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <path d={fillPath} fill={lineColor} opacity={0.08} />
      <polyline
        points={polyPoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
