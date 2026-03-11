import { NextResponse } from "next/server";
import { ZodSchema } from "zod";

export async function parseJson<T>(request: Request, schema: ZodSchema<T>) {
  const payload = await request.json();
  return schema.parse(payload);
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, status = 400) {
  return json({ error: message }, { status });
}
