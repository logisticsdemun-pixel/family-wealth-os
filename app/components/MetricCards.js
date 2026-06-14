'use client'

export default function MetricCards({ cards }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cards.length}, 1fr)`,
      gap: 16,
      marginBottom: 24,
    }}>
      {cards.map((card, i) => (
        <div key={i} style={{
          background: 'var(--color-background-secondary)',
          borderRadius: 'var(--border-radius-lg)',
          border: '0.5px solid var(--color-border-tertiary)',
          padding: '20px 24px',
        }}>
          <p style={{
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 10px',
          }}>
            {card.label}
          </p>
          <p style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.3px',
            color: card.valueColor || 'var(--color-text-primary)',
            margin: card.sub ? '0 0 4px' : 0,
          }}>
            {card.value}
          </p>
          {card.sub && (
            <p style={{
              fontSize: 13,
              fontWeight: 400,
              color: card.subColor || 'var(--color-text-secondary)',
              margin: 0,
            }}>
              {card.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
