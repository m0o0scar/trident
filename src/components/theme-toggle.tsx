"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline"

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return (
            <button className="btn btn-ghost btn-sm btn-square">
                <SunIcon className="h-5 w-5" />
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
            {theme === 'system' && <ComputerDesktopIcon className="h-5 w-5" />}
            {theme === 'light' && <SunIcon className="h-5 w-5" />}
            {theme === 'dark' && <MoonIcon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
        </button>
    )
}
