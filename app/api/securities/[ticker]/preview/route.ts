import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { badRequest, json } from "@/lib/http";
import { fetchSecurityPreview } from "@/lib/market";

type Context = {
  params: Promise<{ ticker: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: Context) {
  const auth = await requireUser();
  if ("error" in auth) {
    return auth.error;
  }

  const { ticker } = await context.params;
  if (!ticker) {
    return badRequest("Missing ticker");
  }

  try {
    const preview = await fetchSecurityPreview(ticker);
    return json({ preview, valid: true });
  } catch (error) {
    return json(
      {
        preview: null,
        valid: false,
        error: error instanceof Error ? error.message : "Failed to load security preview"
      },
      { status: 200 }
    );
  }
}
