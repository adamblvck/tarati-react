import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tarati-theme";
const ThemeContext = createContext(null);

const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const readStored = () => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    // Private browsing, or storage disabled. Fall back to the system.
    return null;
  }
};

export const ThemeProvider = ({ children }) => {
  // The inline script in index.html has already resolved and applied a theme
  // before first paint; read it back rather than resolving again, so the very
  // first render agrees with what is on screen.
  const [theme, setThemeState] = useState(() => {
    if (typeof document !== "undefined") {
      const applied = document.documentElement.getAttribute("data-theme");
      if (applied === "light" || applied === "dark") return applied;
    }
    return readStored() ?? (systemPrefersDark() ? "dark" : "light");
  });

  // Whether the user has made an explicit choice. Until they do, the app keeps
  // following the operating system — someone whose phone flips to dark at
  // sunset should see Tarati follow, without having to know we have a toggle.
  const [pinned, setPinned] = useState(() => readStored() !== null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (pinned || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setThemeState(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pinned]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    setPinned(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisting is survivable; the toggle still works for this visit */
    }
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme]
  );

  const value = useMemo(
    () => ({ theme, isDark: theme === "dark", setTheme, toggleTheme, followsSystem: !pinned }),
    [theme, pinned, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
};
