import { aj } from "@/config/Arcjet";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  if (!aj) {
    return NextResponse.json(
      { error: "ARCJET_KEY is not configured" },
      { status: 503 }
    );
  }

  const userId = "user_35Xx7PhRuWYGNYCvVMVuVIo6m4Q";

  const decision = await aj.protect(req, {
    userId,
    requested: 5,
  });

  if (decision.isDenied()) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
  }

  return NextResponse.json({
    message: "Request allowed",
    userId,
  });
}
