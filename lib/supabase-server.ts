import {
  createMiddlewareClient,
  createRouteHandlerClient,
  createServerComponentClient
} from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export function createSupabaseServerComponentClient() {
  const { cookies } = require("next/headers") as typeof import("next/headers");
  return createServerComponentClient({ cookies });
}

export function createSupabaseRouteHandlerClient() {
  const { cookies } = require("next/headers") as typeof import("next/headers");
  return createRouteHandlerClient({ cookies });
}

export function createSupabaseMiddlewareClient(request: NextRequest, response: NextResponse) {
  return createMiddlewareClient({ req: request, res: response });
}
