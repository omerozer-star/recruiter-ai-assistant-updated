import { NextResponse } from "next/server";
import { AUTOMATION_UNAVAILABLE } from "@/lib/publisher";

/**
 * Facebook group discovery depends on browser automation utilities that are
 * not included in this repository.
 */
export async function POST() {
  return NextResponse.json({ error: AUTOMATION_UNAVAILABLE }, { status: 501 });
}

export async function GET() {
  return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
}
