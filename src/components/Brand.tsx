import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** EG corporate logo + product wordmark used in the app header. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3", className)}>
      <Image
        src="/brand/eg-logo.svg"
        alt="EG Group"
        width={96}
        height={38}
        priority
      />
      <span className="hidden sm:flex flex-col leading-tight">
        <span className="text-sm font-semibold text-white">Fuel Price Optimisation</span>
        <span className="text-[11px] text-white/60">Multi-agent pricing</span>
      </span>
    </Link>
  );
}

/** Small banner-brand chip shown on site cards / map tooltips. */
export function BrandBadge({ brand, className }: { brand: string; className?: string }) {
  const isCorporate = brand === "EG";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        isCorporate
          ? "bg-eg-navy text-white"
          : "bg-eg-surface-2 text-eg-ink-soft border border-eg-line",
        className
      )}
    >
      {brand}
    </span>
  );
}
