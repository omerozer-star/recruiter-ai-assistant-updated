import { NextResponse } from "next/server";
import { AUTOMATION_UNAVAILABLE } from "@/lib/publisher";

export async function POST() {
  return NextResponse.json(
    { running: false, ok: false, status: "החיבור לא זמין", error: AUTOMATION_UNAVAILABLE },
    { status: 501 }
  );
}

export async function GET() {
  return NextResponse.json({ running: false, ok: false, status: "טרם הופעל חיבור Chrome" });
}
