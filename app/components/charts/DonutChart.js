'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export default function DonutChart({ data = [], centerLabel, centerSub, onSegmentClick }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="75%"
            paddingAngle={2}
            onClick={(_, idx) => onSegmentClick?.(data[idx])}
            style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`}
            contentStyle={{
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-primary)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--color-text-primary)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{centerLabel}</span>
          {centerSub && (
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>{centerSub}</span>
          )}
        </div>
      )}
    </div>
  )
}
