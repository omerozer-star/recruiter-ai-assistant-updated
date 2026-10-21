import { NextResponse } from "next/server";
import { AUTOMATION_UNAVAILABLE } from "@/lib/publisher";

/**
 * Checking pending Facebook join requests depends on browser automation
 * utilities that are not included in this repository.
 */
export async function POST() {
  return NextResponse.json({ error: AUTOMATION_UNAVAILABLE }, { status: 501 });
}
