'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'

function fmtINR(v) {
  const abs = Math.abs(v)
  if (abs >= 1e7) return `${v < 0 ? '-' : ''}₹${(abs / 1e7).toFixed(1)}Cr`
  if (abs >= 1e5) return `${v < 0 ? '-' : ''}₹${(abs / 1e5).toFixed(1)}L`
  if (abs >= 1e3) return `${v < 0 ? '-' : ''}₹${(abs / 1e3).toFixed(1)}K`
  return `₹${v.toFixed(0)}`
}

export default function WaterfallChart({ items = [], total, onBarClick }) {
  const totalItem = total != null
    ? { label: 'Total', value: total, color: 'var(--color-text-muted)', isTotal: true }
    : null
  const chartData = [
    ...items.map(item => ({ ...item, isTotal: false })),
    ...(totalItem ? [totalItem] : []),
  ]

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 4, bottom: 4, left: 0 }}
        onClick={(d) => {
          const p = d?.activePayload?.[0]?.payload
          if (p && !p.isTotal) onBarClick?.(p)
        }}
      >
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <ReferenceLine y={0} stroke="var(--color-border-primary)" strokeWidth={1} />
        <Tooltip
          contentStyle={{
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-primary)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--color-text-primary)',
          }}
          formatter={(v) => [fmtINR(v), 'Change']}
          cursor={{ fill: 'var(--color-background-tertiary)' }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} cursor="pointer" label={{ position: 'top', fontSize: 9, fill: 'var(--color-text-muted)', formatter: fmtINR }}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.isTotal
                  ? 'var(--color-border-primary)'
                  : entry.value >= 0
                    ? entry.color
                    : 'var(--color-negative)'
              }
              opacity={entry.isTotal ? 0.6 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
