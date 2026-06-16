import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#E8EAED',
    }}>
      <div style={{
        marginBottom: 24,
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#1A1F26',
          letterSpacing: '-0.4px',
          margin: '0 0 4px',
          fontFamily: 'Inter, sans-serif',
        }}>
          Grey Diary
        </h1>
        <p style={{
          fontSize: 13,
          color: '#4A5260',
          margin: 0,
          fontFamily: 'Inter, sans-serif',
        }}>
          Private family wealth management
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: {
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              borderRadius: '12px',
            }
          }
        }}
      />
    </div>
  )
}
