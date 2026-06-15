'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { loadAppearance, saveAppearance, applyTheme } from './themes'

const ThemeCtx = createContext({
  themeId: 'overcast',
  dark: false,
  setTheme: () => {},
  toggleDark: () => {},
})

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState('overcast')
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const { themeId: tid, dark: d } = loadAppearance()
    setThemeId(tid)
    setDark(d)
    applyTheme(tid, d)
  }, [])

  function setTheme(tid) {
    setThemeId(tid)
    saveAppearance(tid, dark)
    applyTheme(tid, dark)
  }

  function toggleDark() {
    const next = !dark
    setDark(next)
    saveAppearance(themeId, next)
    applyTheme(themeId, next)
  }

  return (
    <ThemeCtx.Provider value={{ themeId, dark, setTheme, toggleDark }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export function useTheme() { return useContext(ThemeCtx) }
