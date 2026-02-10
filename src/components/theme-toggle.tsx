"use client"

import * as React from "react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <button className="btn btn-ghost btn-sm btn-square">
                ☀️
                <span className="sr-only">Toggle theme</span>
            </button>
        )
    }

    const toggleTheme = () => {
        if (theme === 'system') setTheme('light')
        else if (theme === 'light') setTheme('dark')
        else setTheme('system')
    }

    return (
        <button className="btn btn-ghost btn-sm btn-square" onClick={toggleTheme} title={`Current theme: ${theme}`}>
            {theme === 'system' && <span className="text-lg">💻</span>}
            {theme === 'light' && <span className="text-lg">☀️</span>}
            {theme === 'dark' && <span className="text-lg">🌙</span>}
            <span className="sr-only">Toggle theme</span>
        </button>
    )
}
