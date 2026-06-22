'use client'

export default function PageLayout({ children, maxWidth }) {
  return (
    <div style={{
      maxWidth: maxWidth || 1100,
      margin: '0 auto',
      padding: '24px 28px',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {children}
    </div>
  )
}
