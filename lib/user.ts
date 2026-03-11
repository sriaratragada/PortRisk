import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

export async function ensureAppUserRecord(user: SupabaseUser) {
  if (!user.email) {
    throw new Error("Authenticated user is missing email");
  }

  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      email: user.email
    },
    create: {
      id: user.id,
      email: user.email
    }
  });
}
