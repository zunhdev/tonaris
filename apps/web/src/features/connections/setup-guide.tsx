// How to connect each required client (DS-86, FR-10.1): pick Claude, ChatGPT or Codex, then its prerequisites and three
// or four steps, with the server URL to copy and what the two modes allow. The steps follow each vendor's own help as of
// 29 October 2026 (TON-86); their menus move, so check them when a client changes its UI.

import { useState, type ReactNode } from "react";

import { Button } from "@tonaris/ui/components/button";
import { SegmentedControl } from "@tonaris/ui/components/segmented-control";

import { modeText } from "./modes";

type Client = "claude" | "chatgpt" | "codex";

const clients = [
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "codex", label: "Codex" },
] as const satisfies readonly { value: Client; label: string }[];

/** A menu or button name, as the client shows it. */
const Ui = ({ children }: { children: ReactNode }) => (
  <span className="font-medium text-fg-primary">{children}</span>
);

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-raised px-1 py-0.5 text-fg-primary">{children}</code>
);

/** Each client's prerequisites and steps; `url` is the server URL. */
function guideOf(client: Client, url: string): { before: ReactNode; steps: ReactNode[] } {
  const signIn = (
    <>
      Sign in to Tonaris with your email, and choose what it may do: <Ui>Read-only</Ui> or{" "}
      <Ui>Manage collection</Ui>.
    </>
  );
  if (client === "claude") {
    return {
      before:
        "Claude on the web, desktop or mobile, any plan. On Free, Claude allows one custom connector. On a Team or Enterprise plan, an owner of your organization adds it first; you then connect it from the same page.",
      steps: [
        <>
          In Claude, open <Ui>Customize</Ui> › <Ui>Connectors</Ui> (claude.ai/customize/connectors),
          and choose <Ui>+ Add</Ui> › <Ui>Add custom connector</Ui>.
        </>,
        <>
          Name it Tonaris, paste the server URL, and choose <Ui>Continue</Ui> twice. Keep{" "}
          <Ui>Sign in now</Ui>, and choose <Ui>Add</Ui>.
        </>,
        signIn,
        <>
          In a chat, turn Tonaris on under <Ui>+</Ui> › <Ui>Connectors</Ui>, then ask about your
          collection.
        </>,
      ],
    };
  }
  if (client === "chatgpt") {
    return {
      before:
        "ChatGPT on the web with a paid plan, such as Plus. In a workspace, your admin may have to allow custom MCP servers first.",
      steps: [
        <>
          Open chatgpt.com/plugins, and choose <Ui>+ Add</Ui> › <Ui>Add custom MCP server</Ui>.
        </>,
        <>
          Name it Tonaris, paste the server URL under <Ui>Server URL</Ui>, choose <Ui>OAuth</Ui>,
          accept the warning, and choose <Ui>Create as a plugin</Ui>.
        </>,
        <>Install the plugin. {signIn}</>,
        <>
          In a chat, type <Code>@</Code> and pick Tonaris. ChatGPT may ask you to confirm a change
          before it makes it. If you reconnect in another mode, choose <Ui>Refresh</Ui> on the
          plugin&apos;s page, so ChatGPT sees what Tonaris now allows.
        </>,
      ],
    };
  }
  return {
    before:
      "Codex in the ChatGPT desktop app, or the Codex CLI, signed in with your ChatGPT account. Both read the same settings, so adding it once is enough.",
    steps: [
      <>
        Open <Ui>Settings</Ui> › <Ui>MCP servers</Ui>, and choose <Ui>Add server</Ui>.
      </>,
      <>
        Name it tonaris, choose <Ui>Streamable HTTP</Ui>, paste the server URL, save, and choose{" "}
        <Ui>Restart</Ui>.
      </>,
      <>
        Choose <Ui>Authenticate</Ui> next to it. {signIn}
      </>,
      <>
        Or, in the CLI: <Code>codex mcp add tonaris --url {url}</Code>, then{" "}
        <Code>codex mcp login tonaris</Code>.
      </>,
    ],
  };
}

/** The server URL with Copy, and the steps for the client chosen (DS-86). */
export function SetupGuide({ serverUrl }: { serverUrl: string }) {
  const [client, setClient] = useState<Client>("claude");
  const [copied, setCopied] = useState(false);
  const guide = guideOf(client, serverUrl);

  async function copy() {
    await navigator.clipboard.writeText(serverUrl);
    setCopied(true);
  }

  return (
    <section aria-labelledby="connect-client" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 id="connect-client" className="text-title text-fg-primary">
          Connect an AI client
        </h2>
        <p className="text-fg-secondary">
          Use your own AI account: Claude, ChatGPT or Codex reads and organizes your collection
          through this server URL.
        </p>
        <div className="flex items-center gap-2">
          <code
            aria-label="MCP server URL"
            className="min-w-0 flex-1 truncate rounded-md border border-subtle bg-raised px-2.5 py-1.5 text-fg-primary"
          >
            {serverUrl}
          </code>
          <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
        </div>
      </div>

      <SegmentedControl
        aria-label="AI client"
        value={client}
        onValueChange={setClient}
        options={clients}
        className="max-w-sm"
      />
      <p className="text-small text-fg-secondary">{guide.before}</p>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-fg-secondary">
        {guide.steps.map((step, index) => (
          // oxlint-disable-next-line no-array-index-key -- the steps are fixed and in order
          <li key={index}>{step}</li>
        ))}
      </ol>

      <div className="flex flex-col gap-1.5 rounded-lg border border-subtle bg-raised p-3">
        <h3 className="text-fg-primary">What a client may do</h3>
        <dl className="flex flex-col gap-1.5">
          {(["read_only", "manage"] as const).map((mode) => (
            <div key={mode}>
              <dt className="text-fg-primary">{modeText[mode].title}</dt>
              <dd className="text-small text-fg-secondary">{modeText[mode].description}</dd>
            </div>
          ))}
        </dl>
        <p className="text-small text-fg-secondary">
          When a client asks to delete something, it gives you a link to approve it here. Requests
          waiting for you show above, and under Approvals in the sidebar.
        </p>
      </div>
    </section>
  );
}
