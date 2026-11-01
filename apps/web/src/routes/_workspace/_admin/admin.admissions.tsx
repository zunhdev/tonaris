// Admin → Admissions (DS-100, FR-11.6): accepting new members, inviting by email, and every invitation
// (features/admin/admissions.tsx). For the creator only, as all of Admin (_admin.tsx).

import { api } from "@/api";
import { AdminAdmissions } from "@/features/admin/admissions";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_admin/admin/admissions")({
  staticData: { title: "Admissions" },
  head: () => ({ meta: [{ title: "Admissions · Tonaris" }] }),
  loader: async () => {
    const { data, status } = await api.v1.admin.admissions.get();
    if (!data) throw new Error(`Couldn't load admissions (HTTP ${status}).`);
    return data;
  },
  component: AdmissionsPage,
});

function AdmissionsPage() {
  return <AdminAdmissions admissions={Route.useLoaderData()} />;
}
