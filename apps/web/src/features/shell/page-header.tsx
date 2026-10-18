// The main view's header (DS-30): the page title, which also names the main landmark.

export const pageTitleId = "page-title";

export function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center border-b border-subtle px-6">
      <h1 id={pageTitleId} className="truncate text-page text-fg-primary">
        {title}
      </h1>
    </header>
  );
}
