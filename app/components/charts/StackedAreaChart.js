'use client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function StackedAreaChart({ series = [], xLabels = [] }) {
  const chartData = xLabels.map((label, i) => {
    const point = { label }
    series.forEach(s => { point[s.key] = s.data[i] ?? 0 })
    return point
  })

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-primary)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--color-text-primary)',
          }}
          formatter={(v, key) => [`₹${Number(v).toLocaleString('en-IN')}`, series.find(s => s.key === key)?.label || key]}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            stackId="1"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
