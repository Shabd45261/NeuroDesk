import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

// White is the identity, not a preference: the app ships one theme and it is
// this one, so an install should look white-primary before anyone has chosen
// anything. The toggle still exists but both palettes render identically.
function getInitialTheme() {
  const stored = localStorage.getItem('neurodesk-theme')
  if (stored) return stored
  return 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('neurodesk-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
