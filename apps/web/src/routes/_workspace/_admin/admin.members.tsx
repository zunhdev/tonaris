// Admin → Members (DS-100, FR-11.5, FR-11.6): every account, and recovering a member's sign-in email
// (features/admin/members.tsx). For the creator only, as all of Admin (_admin.tsx).

import { api } from "@/api";
import { AdminMembers } from "@/features/admin/members";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_admin/admin/members")({
  staticData: { title: "Members" },
  head: () => ({ meta: [{ title: "Members · Tonaris" }] }),
  loader: async () => {
    const { data, status } = await api.v1.admin.members.get();
    if (!data) throw new Error(`Couldn't load the members (HTTP ${status}).`);
    return data.members;
  },
  component: MembersPage,
});

function MembersPage() {
  return <AdminMembers members={Route.useLoaderData()} />;
}
