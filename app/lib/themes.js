export const THEMES = {

  'warm-linen': {
    id: 'warm-linen',
    name: 'Warm Linen',
    description: 'Warm off-white canvas · aged paper · amber-tan accent',
    swatch: ['#FAF8F4', '#D4B896'],
    vars: {
      '--color-background-primary':    '#FAF8F4',
      '--color-background-secondary':  '#FFFFFF',
      '--color-background-tertiary':   '#F0EBE0',
      '--color-text-primary':          '#1C1917',
      '--color-text-secondary':        '#78716C',
      '--color-text-muted':            '#A8A29E',
      '--color-border-primary':        '#D6CFC4',
      '--color-border-secondary':      '#E0D9CE',
      '--color-border-tertiary':       '#EDE8DF',
      '--color-accent':                '#D4B896',
      '--color-accent-bg':             '#FAF4EC',
      '--color-accent-subtle':         '#F0E8D8',
      '--color-sidebar-bg':            '#F0EBE0',
      '--color-sidebar-active':        '#E4DDD0',
      '--color-sidebar-text':          '#1C1917',
      '--color-sidebar-muted':         '#78716C',
      '--font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },

  'overcast': {
    id: 'overcast',
    name: 'Overcast',
    description: 'Cloudy grey sidebar · structured neutral · slate accent',
    swatch: ['#C8CDD4', '#6B8FA8'],
    vars: {
      '--color-background-primary':    '#E8EAED',
      '--color-background-secondary':  '#F4F5F6',
      '--color-background-tertiary':   '#C8CDD4',
      '--color-text-primary':          '#1A1F26',
      '--color-text-secondary':        '#4A5260',
      '--color-text-muted':            '#7A8490',
      '--color-border-primary':        '#B0B6BE',
      '--color-border-secondary':      '#BDC2C9',
      '--color-border-tertiary':       '#CDD0D4',
      '--color-accent':                '#6B8FA8',
      '--color-accent-bg':             '#EBF0F4',
      '--color-accent-subtle':         '#D8E4EC',
      '--color-sidebar-bg':            '#C8CDD4',
      '--color-sidebar-active':        '#B8BEC6',
      '--color-sidebar-text':          '#1A1F26',
      '--color-sidebar-muted':         '#4A5260',
      '--font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },

  'icy-horizon': {
    id: 'icy-horizon',
    name: 'Icy Horizon',
    description: 'Pale cool blue-white · Scandinavian · golden accent',
    swatch: ['#F0F5FB', '#C9A84C'],
    vars: {
      '--color-background-primary':    '#F0F5FB',
      '--color-background-secondary':  '#FFFFFF',
      '--color-background-tertiary':   '#E2EDF7',
      '--color-text-primary':          '#0F172A',
      '--color-text-secondary':        '#475569',
      '--color-text-muted':            '#94A3B8',
      '--color-border-primary':        '#BFDBF7',
      '--color-border-secondary':      '#CCE4F9',
      '--color-border-tertiary':       '#DBEEFB',
      '--color-accent':                '#C9A84C',
      '--color-accent-bg':             '#FBF6E4',
      '--color-accent-subtle':         '#F5ECC8',
      '--color-sidebar-bg':            '#E2EDF7',
      '--color-sidebar-active':        '#CCDFF2',
      '--color-sidebar-text':          '#0F172A',
      '--color-sidebar-muted':         '#475569',
      '--font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },
}

export const DARK_OVERLAY = {
  '--color-background-primary':    '#18181B',
  '--color-background-secondary':  '#27272A',
  '--color-background-tertiary':   '#1F1F22',
  '--color-text-primary':          '#FAFAFA',
  '--color-text-secondary':        '#A1A1AA',
  '--color-text-muted':            '#71717A',
  '--color-border-primary':        '#3F3F46',
  '--color-border-secondary':      '#52525B',
  '--color-border-tertiary':       '#3F3F46',
  '--color-sidebar-bg':            '#111113',
  '--color-sidebar-active':        '#2D2D30',
  '--color-sidebar-text':          '#FAFAFA',
  '--color-sidebar-muted':         '#A1A1AA',
}

export const DEFAULT_THEME = 'overcast'

const STORAGE_KEY = 'fwos-appearance'

export function loadAppearance() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { themeId: DEFAULT_THEME, dark: false }
    return { themeId: DEFAULT_THEME, dark: false, ...JSON.parse(raw) }
  } catch {
    return { themeId: DEFAULT_THEME, dark: false }
  }
}

export function saveAppearance(themeId, dark) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ themeId, dark }))
  } catch {}
}

export function applyTheme(themeId, dark) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME]
  const vars = dark ? { ...theme.vars, ...DARK_OVERLAY } : theme.vars
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
}
