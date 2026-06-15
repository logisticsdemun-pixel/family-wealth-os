import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-background-primary, #E8EAED)',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--color-text-primary, #1A1F26)',
          letterSpacing: '-0.4px',
          margin: '0 0 4px',
        }}>
          Grey Diary
        </h1>
        <p style={{
          fontSize: 13,
          color: 'var(--color-text-secondary, #4A5260)',
          margin: 0,
        }}>
          Private family wealth management
        </p>
      </div>
      <SignIn />
    </div>
  )
}
