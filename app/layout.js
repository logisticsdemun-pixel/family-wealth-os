import './globals.css'
import AuthShell from './components/AuthShell'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata = {
  title: 'Grey Diary',
  description: 'Private family wealth management',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
        <script dangerouslySetInnerHTML={{ __html: `try{var p=JSON.parse(localStorage.getItem('fwos-appearance')||'{}');var id=p.themeId||'overcast';var dk=!!p.dark;var T={'warm-linen':{'--color-background-primary':'#FDFAF5','--color-background-secondary':'#FFFFFF','--color-text-primary':'#2C2018','--color-text-secondary':'#7A6E65','--color-border-tertiary':'#ECE6DC','--color-accent':'#B07840','--color-sidebar-bg':'#EDE8DF','--color-sidebar-active':'#DDD6CA','--color-sidebar-text':'#2C2018','--color-sidebar-muted':'#7A6E65'},'overcast':{'--color-background-primary':'#E8EAED','--color-background-secondary':'#F4F5F6','--color-text-primary':'#1A1F26','--color-text-secondary':'#4A5260','--color-border-tertiary':'#CDD0D4','--color-accent':'#6B8FA8','--color-sidebar-bg':'#C8CDD4','--color-sidebar-active':'#B8BEC6','--color-sidebar-text':'#1A1F26','--color-sidebar-muted':'#4A5260'},'icy-horizon':{'--color-background-primary':'#EBF3FA','--color-background-secondary':'#FFFFFF','--color-text-primary':'#0D2137','--color-text-secondary':'#2A5070','--color-border-tertiary':'#C0D8EE','--color-accent':'#C9A84C','--color-sidebar-bg':'#D6E4F0','--color-sidebar-active':'#B8D0E8','--color-sidebar-text':'#0D2137','--color-sidebar-muted':'#2A5070'}};var v=T[id]||T['overcast'];var r=document.documentElement;Object.keys(v).forEach(function(k){r.style.setProperty(k,v[k])});if(dk){r.style.setProperty('--color-background-primary','#18181B');r.style.setProperty('--color-background-secondary','#27272A');r.style.setProperty('--color-text-primary','#FAFAFA');r.style.setProperty('--color-text-secondary','#A1A1AA');r.style.setProperty('--color-border-tertiary','#3F3F46');r.style.setProperty('--color-sidebar-bg','#111113');r.style.setProperty('--color-sidebar-active','#2D2D30');r.style.setProperty('--color-sidebar-text','#FAFAFA');r.style.setProperty('--color-sidebar-muted','#A1A1AA');r.setAttribute('data-theme','dark')}}catch(e){}` }} />
      </head>
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  )
}
