// Admin → Operations (TS-115): where the backups are (Render's, TS-112), the jobs that gave up after their retries,
// and a test error that checks the error reports end to end: the API's and the browser's, each with a fake address
// that must arrive redacted.

import { api } from "@/api";
import { AdminNav } from "@/features/admin/admin-nav";
import { useNarrowScreen } from "@/features/collection/collection-ui";
import { DesktopOnly } from "@/features/shell/desktop-only";
import { PageHeader } from "@/features/shell/page-header";
import { reportTestError } from "@/observability";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@tonaris/ui/components/button";

export const Route = createFileRoute("/_workspace/admin/operations")({
  head: () => ({ meta: [{ title: "Operations · Tonaris" }] }),
  beforeLoad: ({ context }) => {
    if (context.account.role !== "creator") throw notFound();
  },
  loader: async () => {
    const { data, status } = await api.v1.admin.operations.get();
    if (!data) throw new Error(`Couldn't load the service's health (HTTP ${status}).`);
    return data;
  },
  component: OperationsPage,
});

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function OperationsPage() {
  const narrow = useNarrowScreen();
  const { failedJobs } = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Operations" back={{ to: "/c", label: "Collection" }} />
      <AdminNav />
      {narrow ? (
        <DesktopOnly what="Admin" />
      ) : (
        <div className="flex max-w-5xl flex-col gap-6 p-6">
          <section aria-labelledby="backups" className="flex flex-col gap-2">
            <h2 id="backups" className="text-title text-fg-primary">
              Backups
            </h2>
            <p className="text-fg-secondary">
              Render backs up the database continuously and can restore it to any moment of the last
              3 days, or 7 on its Pro plan. Its dashboard shows them, under the database's Recovery
              page. To restore one, follow docs/runbooks/restore.md.
            </p>
          </section>
          <TestError />
          <section aria-labelledby="failed-jobs" className="flex flex-col gap-2">
            <h2 id="failed-jobs" className="text-title text-fg-primary">
              Jobs that gave up
            </h2>
            {failedJobs.length === 0 ? (
              <p className="text-fg-secondary">
                None. Every job finished or is still being retried.
              </p>
            ) : (
              <table className="w-full text-left">
                <thead className="text-small text-fg-secondary">
                  <tr>
                    <th className="py-1.5 pr-3 font-normal">Kind</th>
                    <th className="py-1.5 pr-3 font-normal">Attempts</th>
                    <th className="py-1.5 pr-3 font-normal">Gave up</th>
                    <th className="py-1.5 font-normal">Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {failedJobs.map((job) => (
                    <tr key={job.id} className="border-t border-subtle align-top">
                      <td className="py-1.5 pr-3 text-fg-primary">{job.kind}</td>
                      <td className="py-1.5 pr-3 text-fg-secondary tabular-nums">{job.attempts}</td>
                      <td className="py-1.5 pr-3 text-fg-secondary">
                        {when.format(new Date(job.deadAt))}
                      </td>
                      <td className="py-1.5 text-fg-secondary">{job.lastError ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function TestError() {
  const [sent, setSent] = useState<string>();
  async function send() {
    setSent(undefined);
    // It fails on purpose: the API reports it, then answers 500.
    await api.v1.admin.operations["test-error"].post({}).catch(() => undefined);
    setSent(
      (await reportTestError())
        ? "Sent from the API and from this browser. In Sentry, each shows [email] where the address was."
        : "Sent from the API, which logged it. This browser has no Sentry key (SENTRY_DSN), so it sent nothing.",
    );
  }
  return (
    <section aria-labelledby="test-error" className="flex flex-col gap-2">
      <h2 id="test-error" className="text-title text-fg-primary">
        Error reports
      </h2>
      <p className="text-fg-secondary">
        Send a test error to check that errors reach the logs and Sentry, with addresses and tokens
        redacted.
      </p>
      <Button className="self-start" onClick={() => void send()}>
        Send a test error
      </Button>
      <p aria-live="polite" className="text-fg-secondary empty:hidden">
        {sent}
      </p>
    </section>
  );
}
