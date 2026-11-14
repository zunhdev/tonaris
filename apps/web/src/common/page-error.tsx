// What a page shows when it can't be shown (DS-91, DRIFT-081): in its own place, so the shell and the rest of the
// app stay. A request Tonaris didn't answer, or answered with a server error, says so and offers Try again; a page
// refused (a 4xx) says it isn't available; anything else, such as a bug while drawing it, says something went wrong.
// A page's loader throws `LoadError` (`loadOrThrow`) so its status is kept.

import { useRouter } from "@tanstack/react-router";

import { Button } from "@tonaris/ui/components/button";

import { unreachable } from "./unreachable";

/** A page's data that couldn't be read, with the API's status. */
export class LoadError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(`Couldn't load ${what} (HTTP ${status}).`);
  }
}

/** A loader's answer's data, or a `LoadError` naming `what` and keeping the status. */
export function loadOrThrow<T>(answer: { data: T | null; status: number }, what: string): T {
  if (answer.data === null) throw new LoadError(answer.status, what);
  return answer.data;
}

/** The title and sentence for `error`. */
export function pageErrorText(error: unknown): { title: string; detail: string; retry: boolean } {
  if (error instanceof LoadError && error.status >= 400 && error.status < 500)
    return { title: "Not available", detail: "This page isn't available to you.", retry: false };
  if (error instanceof LoadError || error instanceof TypeError)
    return { title: "Couldn't reach Tonaris", detail: unreachable, retry: true };
  return {
    title: "Something went wrong",
    detail: "This page couldn't be shown. Try again, or reload the app.",
    retry: true,
  };
}

/** A page's error, in its place (a route's error component). */
export function PageError({ error }: { error: unknown }) {
  const router = useRouter();
  const { title, detail, retry } = pageErrorText(error);
  return (
    <main
      aria-labelledby="page-error-title"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 id="page-error-title" className="text-page text-fg-primary">
        {title}
      </h1>
      <p className="max-w-sm text-fg-secondary">{detail}</p>
      {retry && <Button onClick={() => void router.invalidate()}>Try again</Button>}
    </main>
  );
}
