"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem("theme");
      } catch {
        return null;
      }
    })();
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button className="icon-btn" onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      {theme === "dark" ? <Icon.sun /> : <Icon.moon />}
    </button>
  );
}
