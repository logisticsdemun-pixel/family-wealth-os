export const THEMES = {
  'overcast': {
    name: 'Overcast',
    vars: {
      '--color-background-primary':   '#F8F8F6',
      '--color-background-secondary': '#EFEFED',
      '--color-background-tertiary':  '#E5E5E2',
      '--color-text-primary':         '#2C2C2A',
      '--color-text-secondary':       '#6B6B68',
      '--color-text-muted':           '#9E9E9B',
      '--color-border-primary':       '#C8C8C4',
      '--color-border-secondary':     '#D8D8D4',
      '--color-border-tertiary':      '#E4E4E0',
      '--color-accent':               '#534AB7',
      '--color-accent-bg':            '#EEEDFE',
      '--color-accent-subtle':        '#AFA9EC',
      '--color-sidebar-bg':           '#E8E8E5',
      '--color-sidebar-active':       '#DCDCD8',
    },
  },
  'warm-linen': {
    name: 'Warm Linen',
    vars: {
      '--color-background-primary':   '#FAFAF7',
      '--color-background-secondary': '#F3F2EE',
      '--color-background-tertiary':  '#E8E7E2',
      '--color-text-primary':         '#2A2420',
      '--color-text-secondary':       '#7A6D65',
      '--color-text-muted':           '#A89C94',
      '--color-border-primary':       '#C8C4BC',
      '--color-border-secondary':     '#D8D4CC',
      '--color-border-tertiary':      '#E4E0D8',
      '--color-accent':               '#C96A20',
      '--color-accent-bg':            '#FDF0E6',
      '--color-accent-subtle':        '#FAE0C8',
      '--color-sidebar-bg':           '#EEEBE4',
      '--color-sidebar-active':       '#E2DDD4',
    },
  },
  'icy-horizon': {
    name: 'Icy Horizon',
    vars: {
      '--color-background-primary':   '#F5F7FA',
      '--color-background-secondary': '#EBF0F5',
      '--color-background-tertiary':  '#E0E8EF',
      '--color-text-primary':         '#1A2733',
      '--color-text-secondary':       '#4D6578',
      '--color-text-muted':           '#7E9BAD',
      '--color-border-primary':       '#B8CDD8',
      '--color-border-secondary':     '#CCDAE3',
      '--color-border-tertiary':      '#D8E4EC',
      '--color-accent':               '#1A6EA8',
      '--color-accent-bg':            '#E3EEF8',
      '--color-accent-subtle':        '#C4DDF0',
      '--color-sidebar-bg':           '#E2EBF2',
      '--color-sidebar-active':       '#D5E3EE',
    },
  },
}

export const DARK_OVERLAY = {
  '--color-background-primary':   '#18181B',
  '--color-background-secondary': '#27272A',
  '--color-background-tertiary':  '#303033',
  '--color-text-primary':         '#F4F4F5',
  '--color-text-secondary':       '#A1A1AA',
  '--color-text-muted':           '#71717A',
  '--color-border-primary':       '#3F3F46',
  '--color-border-secondary':     '#52525B',
  '--color-border-tertiary':      '#3F3F46',
  '--color-sidebar-bg':           '#18181B',
  '--color-sidebar-active':       '#2D2D30',
}

const STORAGE_KEY = 'fwos-appearance'

export function loadAppearance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { themeId: 'overcast', dark: false }
    return { themeId: 'overcast', dark: false, ...JSON.parse(raw) }
  } catch {
    return { themeId: 'overcast', dark: false }
  }
}

export function saveAppearance(themeId, dark) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ themeId, dark }))
  } catch {}
}

export function applyTheme(themeId, dark) {
  const theme = THEMES[themeId] || THEMES['overcast']
  const vars = dark ? { ...theme.vars, ...DARK_OVERLAY } : theme.vars
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
}
