"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

export interface ChartTheme {
  grid: string;
  axis: string;
  navy: string;
  navySoft: string;
  red: string;
  redSoft: string;
  green: string;
  greenSoft: string;
  amber: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const LIGHT: ChartTheme = {
  grid: "#e6ebf5",
  axis: "#7c8aa3",
  navy: "#0a1f44",
  navySoft: "rgba(20, 48, 99, 0.16)",
  red: "#e4002b",
  redSoft: "rgba(228, 0, 43, 0.14)",
  green: "#0f9d58",
  greenSoft: "rgba(15, 157, 88, 0.16)",
  amber: "#e8a23d",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dfe5f0",
  tooltipText: "#0f172a",
};

const DARK: ChartTheme = {
  grid: "#1e2638",
  axis: "#8493ac",
  navy: "#4c7df0",
  navySoft: "rgba(76, 125, 240, 0.22)",
  red: "#ff5a6e",
  redSoft: "rgba(255, 90, 110, 0.2)",
  green: "#34d399",
  greenSoft: "rgba(52, 211, 153, 0.2)",
  amber: "#f4c150",
  tooltipBg: "#1a2438",
  tooltipBorder: "#1e2638",
  tooltipText: "#f4f7fb",
};

export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  const [, force] = useState(0);
  useEffect(() => force((n) => n + 1), [resolved]);
  return resolved === "dark" ? DARK : LIGHT;
}

export function tooltipStyle(t: ChartTheme) {
  return {
    background: t.tooltipBg,
    border: `1px solid ${t.tooltipBorder}`,
    borderRadius: 10,
    fontSize: 12,
    color: t.tooltipText,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  };
}
