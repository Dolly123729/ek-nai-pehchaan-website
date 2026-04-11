import { NextResponse } from "next/server";
import { checkGatewayHealth } from "@/lib/chat-gateway";

export const runtime = "nodejs";

export async function GET() {
  try {
    await checkGatewayHealth();
    return NextResponse.json({ ok: true, service: "BYUH chat gateway" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gateway health check failed.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
