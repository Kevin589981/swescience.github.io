"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "swe-science-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const frame = window.requestAnimationFrame(() => setTheme(currentTheme));

    const followSystemTheme = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(THEME_STORAGE_KEY)) return;
      const nextTheme = event.matches ? "dark" : "light";
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    mediaQuery.addEventListener("change", followSystemTheme);
    return () => {
      window.cancelAnimationFrame(frame);
      mediaQuery.removeEventListener("change", followSystemTheme);
    };
  }, []);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";

  function toggleTheme() {
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">{nextTheme === "dark" ? "☾" : "☀"}</span>
      <span className="theme-toggle-label">{theme === null ? "Theme" : nextTheme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

export function AnimatedStat({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDisplayValue(value));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <NumberFlow
      className="stat-number-flow"
      value={displayValue}
      trend={1}
      transformTiming={{ duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" }}
      spinTiming={{ duration: 850, easing: "cubic-bezier(.16,1,.3,1)" }}
      opacityTiming={{ duration: 280, easing: "ease-out" }}
    />
  );
}
