'use client'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function DayBars({ items = [], daysInMonth = 31 }) {
  const dayMap = Object.fromEntries(items.map(i => [i.day, i]))
  const chartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const entry = dayMap[day]
    return {
      day: String(day),
      amount: entry?.amount ?? 0,
      color: entry?.color ?? 'var(--color-border-secondary)',
    }
  })

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
        <XAxis
          dataKey="day"
          tick={{ fontSize: 8, fill: 'var(--color-text-muted)' }}
          axisLine={false}
          tickLine={false}
          interval={6}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-background-secondary)',
            border: '0.5px solid var(--color-border-primary)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--color-text-primary)',
          }}
          formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Amount']}
          labelFormatter={(day) => `Day ${day}`}
          cursor={{ fill: 'var(--color-background-tertiary)' }}
        />
        <Bar dataKey="amount" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.amount > 0 ? entry.color : 'var(--color-border-secondary)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
