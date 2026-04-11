import { NextResponse } from "next/server";
import { answerAdmissionsQuestion } from "@/lib/chat-gateway";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string };
    const message = body?.message;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    const result = await answerAdmissionsQuestion(message);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI request failed.";
    const status = message === "message is required" ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
