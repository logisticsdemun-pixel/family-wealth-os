export const THEMES = {

  'warm-linen': {
    id: 'warm-linen',
    name: 'Warm Linen',
    description: 'Toasted linen sidebar · cream canvas · amber accent',
    swatch: ['#F0EBE1', '#C4863A'],
    vars: {
      '--color-background-primary':    '#FAF6EF',
      '--color-background-secondary':  '#FFFFFF',
      '--color-background-tertiary':   '#F0EBE1',
      '--color-text-primary':          '#3D2B1F',
      '--color-text-secondary':        '#8C7B70',
      '--color-text-muted':            '#B8A89E',
      '--color-border-primary':        '#D4C8B8',
      '--color-border-secondary':      '#DDD6C8',
      '--color-border-tertiary':       '#E8DFD0',
      '--color-accent':                '#C4863A',
      '--color-accent-bg':             '#FAF0E0',
      '--color-accent-subtle':         '#EFE0C8',
      '--color-sidebar-bg':            '#F0EBE1',
      '--color-sidebar-active':        '#DDD6C8',
      '--color-sidebar-text':          '#3D2B1F',
      '--color-sidebar-muted':         '#8C7B70',
      '--font-sans': '"Georgia", "Times New Roman", serif',
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
    description: 'Frost blue sidebar · cool white canvas · golden accent',
    swatch: ['#D6E4F0', '#C9A84C'],
    vars: {
      '--color-background-primary':    '#EBF3FA',
      '--color-background-secondary':  '#FFFFFF',
      '--color-background-tertiary':   '#D6E4F0',
      '--color-text-primary':          '#0D2137',
      '--color-text-secondary':        '#2A5070',
      '--color-text-muted':            '#5A80A0',
      '--color-border-primary':        '#A8C4DC',
      '--color-border-secondary':      '#B8D0E8',
      '--color-border-tertiary':       '#C0D8EE',
      '--color-accent':                '#C9A84C',
      '--color-accent-bg':             '#FBF5E0',
      '--color-accent-subtle':         '#F5EAC0',
      '--color-sidebar-bg':            '#D6E4F0',
      '--color-sidebar-active':        '#B8D0E8',
      '--color-sidebar-text':          '#0D2137',
      '--color-sidebar-muted':         '#2A5070',
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
