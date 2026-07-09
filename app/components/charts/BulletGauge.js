'use client'

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

export default function BulletGauge({ value = 0, target = 6, max = 12, label, color = 'var(--color-accent)' }) {
  const valuePct = clamp(value / max, 0, 1) * 100
  const targetPct = clamp(target / max, 0, 1) * 100

  const aboveTarget = value >= target
  const fillColor = aboveTarget ? 'var(--color-positive)' : color

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{label}</span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: aboveTarget ? 'var(--color-positive)' : 'var(--color-text-primary)',
          }}>
            {value.toFixed(1)} mo
          </span>
        </div>
      )}
      <div style={{ position: 'relative', height: 10, background: 'var(--color-background-tertiary)', borderRadius: 5 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${valuePct}%`,
          background: fillColor,
          borderRadius: 5,
          transition: 'width 0.4s ease',
        }} />
        {/* target marker */}
        <div style={{
          position: 'absolute', top: -3, bottom: -3,
          left: `calc(${targetPct}% - 1px)`,
          width: 2,
          background: 'var(--color-text-primary)',
          borderRadius: 1,
          opacity: 0.7,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--color-text-muted)' }}>
        <span>0</span>
        <span>Target {target} mo</span>
        <span>{max} mo</span>
      </div>
    </div>
  )
}
