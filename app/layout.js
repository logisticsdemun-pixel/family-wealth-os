import './globals.css'
import AuthShell from './components/AuthShell'

export const metadata = {
  title: 'Grey Diary',
  description: 'Private family wealth management',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  )
}
