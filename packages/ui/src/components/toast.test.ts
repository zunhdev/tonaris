// DS-108's toast rules as features raise them: information for 4 s, undo for 8 s, problems until closed. Base UI
// keeps the timers, pauses them on hover and focus, and shows at most 3 (covered in the browser tests).

import { describe, expect, test } from "bun:test";

import { notifier, type ToastManager } from "./toast";

type Added = Parameters<ToastManager["add"]>[0];

/** A manager that records what it is asked. */
function recorder() {
  const added: Added[] = [];
  const closed: string[] = [];
  return {
    added,
    closed,
    manager: {
      add(options: Added) {
        added.push(options);
        return options.id ?? `toast-${added.length}`;
      },
      close(id?: string) {
        if (id) closed.push(id);
      },
    },
  };
}

describe("notifier (DS-108)", () => {
  test("information closes after 4 s, undo after 8 s, and a problem stays, at high priority", () => {
    const { added, manager } = recorder();
    const notify = notifier(manager);
    notify.info("Already in this list");
    notify.undo({ title: "Removed from Later", onUndo: () => {} });
    notify.problem({
      id: "write",
      title: "Couldn't save the list 'Later'",
      description: "'Later' already exists at the top level. Choose another name.",
      tone: "danger",
      actions: [],
    });
    expect(added.map(({ timeout, priority }) => [timeout, priority])).toEqual([
      [4_000, "low"],
      [8_000, "low"],
      [0, "high"],
    ]);
    expect(added[2]).toMatchObject({ id: "write", data: { tone: "danger" } });
  });

  test("Undo undoes and closes its toast", () => {
    const { added, closed, manager } = recorder();
    let undone = 0;
    const id = notifier(manager).undo({
      title: "Removed from Later",
      onUndo: () => {
        undone += 1;
      },
    });
    const [undo] = added[0]?.data?.actions ?? [];
    expect(undo?.label).toBe("Undo");
    undo?.onClick();
    expect(undone).toBe(1);
    expect(closed).toEqual([id]);
  });

  test("information can offer one action, which closes its toast", () => {
    const { added, closed, manager } = recorder();
    let switched = 0;
    const id = notifier(manager).info("Rearranging works in manual order", undefined, {
      label: "Switch to manual order",
      onClick: () => {
        switched += 1;
      },
    });
    expect(added[0]).toMatchObject({ timeout: 4_000, priority: "low" });
    const [action] = added[0]?.data?.actions ?? [];
    action?.onClick();
    expect(switched).toBe(1);
    expect(closed).toEqual([id]);
  });
});
