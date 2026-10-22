// Folder and list icons (DS-27, DS-41), beside their names in the tree and the views' headers.

import { Folder, ListMusic } from "lucide-react";

import type { ContainerKind } from "@tonaris/domain";

export function ContainerIcon({ kind }: { kind: ContainerKind }) {
  const Icon = kind === "folder" ? Folder : ListMusic;
  return <Icon strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />;
}
