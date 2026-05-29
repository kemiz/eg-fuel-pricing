import { NextRequest, NextResponse } from "next/server";
import { getMapData } from "@/lib/data/server";
import type { Country } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get("country") ?? "US").toUpperCase();
  if (country !== "US" && country !== "UK") {
    return NextResponse.json({ error: "country must be US or UK" }, { status: 400 });
  }
  try {
    const data = await getMapData(country as Country);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
