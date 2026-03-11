import { WorkspaceApp } from "@/components/workspace-app";
import { requireServerUser } from "@/lib/auth";
import { getWorkspaceData } from "@/lib/workspace-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireServerUser();
  const data = await getWorkspaceData({
    id: user.id,
    email: user.email ?? ""
  });

  return <WorkspaceApp initialData={data} />;
}
