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
  grid: "#e4ebf4",
  axis: "#7c8aa3",
  navy: "#005fab",
  navySoft: "rgba(0, 95, 171, 0.14)",
  red: "#d6263b",
  redSoft: "rgba(214, 38, 59, 0.14)",
  green: "#91b508",
  greenSoft: "rgba(145, 181, 8, 0.18)",
  amber: "#e8a23d",
  tooltipBg: "#ffffff",
  tooltipBorder: "#dde4ee",
  tooltipText: "#111827",
};

const DARK: ChartTheme = {
  grid: "#1e2838",
  axis: "#8493ac",
  navy: "#4aa3e8",
  navySoft: "rgba(74, 163, 232, 0.22)",
  red: "#ff6072",
  redSoft: "rgba(255, 96, 114, 0.2)",
  green: "#aace2e",
  greenSoft: "rgba(170, 206, 46, 0.2)",
  amber: "#f4c150",
  tooltipBg: "#1a2336",
  tooltipBorder: "#1e2838",
  tooltipText: "#f3f6fb",
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
