// What a connection may do (FR-10.3, DS-85): the two modes, in the words the consent page and the setup steps share.

import type { McpMode } from "@tonaris/domain";

export const modeText: Record<McpMode, { title: string; description: string }> = {
  read_only: {
    title: "Read-only",
    description: "Read and search your collection and Trash. Can't change anything.",
  },
  manage: {
    title: "Manage collection",
    description:
      "Add, edit, move and organize. Deleting, removing used options and deleting fields always need your approval in Tonaris. Sharing, account settings, export and permanently deleting Trash stay in the app.",
  },
};
