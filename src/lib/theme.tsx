"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Mode = "light" | "dark";

interface ThemeCtx {
  resolved: Mode;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ resolved: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [resolved, setResolved] = useState<Mode>("light");

  useEffect(() => {
    const stored = (localStorage.getItem("eg-theme") as Mode | null) ?? null;
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const next = stored ?? (prefersDark ? "dark" : "light");
    setResolved(next);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const toggle = useCallback(() => {
    setResolved((m) => {
      const next = m === "dark" ? "light" : "dark";
      localStorage.setItem("eg-theme", next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ resolved, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
