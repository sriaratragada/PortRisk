import { LandingPage } from "@/components/landing-page";

export const dynamic = "force-static";

export default async function HomePage() {
  return <LandingPage />;
}
