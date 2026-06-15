import './globals.css'
import AuthShell from './components/AuthShell'

export const metadata = {
  title: 'Grey Diary',
  description: 'Private family wealth management',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=JSON.parse(localStorage.getItem('fwos-appearance')||'null')||{};var id=p.themeId||'overcast';var dk=!!p.dark;var L={'overcast':{'--color-background-primary':'#F8F8F6','--color-background-secondary':'#EFEFED','--color-text-primary':'#2C2C2A','--color-sidebar-bg':'#E8E8E5','--color-accent':'#534AB7','--color-accent-bg':'#EEEDFE','--color-accent-subtle':'#AFA9EC'},'warm-linen':{'--color-background-primary':'#FAFAF7','--color-background-secondary':'#F3F2EE','--color-text-primary':'#2A2420','--color-sidebar-bg':'#EEEBE4','--color-accent':'#C96A20','--color-accent-bg':'#FDF0E6','--color-accent-subtle':'#FAE0C8'},'icy-horizon':{'--color-background-primary':'#F5F7FA','--color-background-secondary':'#EBF0F5','--color-text-primary':'#1A2733','--color-sidebar-bg':'#E2EBF2','--color-accent':'#1A6EA8','--color-accent-bg':'#E3EEF8','--color-accent-subtle':'#C4DDF0'}};var D={'--color-background-primary':'#18181B','--color-background-secondary':'#27272A','--color-text-primary':'#F4F4F5','--color-sidebar-bg':'#18181B'};var t=L[id]||L['overcast'];var v=dk?Object.assign({},t,D):t;var r=document.documentElement;for(var k in v)r.style.setProperty(k,v[k]);if(dk)r.setAttribute('data-theme','dark');}catch(e){}}())` }} />
      </head>
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  )
}
