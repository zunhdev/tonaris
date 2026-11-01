// The Admin tabs (DS-100): Admissions, Members and Operations (TS-115), with the current one marked for assistive
// technology too, as the Settings subnav does.

import { PageTabs, type PageTab } from "@/features/shell/page-tabs";

const pages: readonly PageTab[] = [
  { to: "/admin/admissions", label: "Admissions" },
  { to: "/admin/members", label: "Members" },
  { to: "/admin/operations", label: "Operations" },
];

export function AdminNav() {
  return <PageTabs label="Admin" pages={pages} />;
}
