// What a phone shows where a screen is the desktop's (DS-110): Trash, Settings → Custom fields and admin.

export function DesktopOnly({ what }: { what: string }) {
  return <p className="p-8 text-center text-fg-secondary">{what} is on the desktop app.</p>;
}
