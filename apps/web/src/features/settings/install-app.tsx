// Settings → Preferences → App (DS-94, section 2.2, TON-298): how to install Tonaris in the browser at hand, so it
// opens in its own window, from the Dock, Start menu or home screen; or that it already runs as an installed app.

import { promptInstall, useInstallAdvice, type InstallAdvice } from "@/features/shell/install";
import { useRef, useState } from "react";

import { Button } from "@tonaris/ui/components/button";

const advice: Record<Exclude<InstallAdvice, "prompt">, string> = {
  running: "You're using Tonaris as an installed app.",
  installed: "Tonaris is installed. Open it from your apps, like any other.",
  "mac-safari":
    "Install Tonaris to open it in its own window, from your Dock. In Safari, choose File → Add to Dock.",
  ios: "Add Tonaris to your Home Screen to open it full screen, like an app. Tap Share, then Add to Home Screen.",
  elsewhere:
    "Install Tonaris to open it in its own window, like an app. In Chrome or Edge, choose Install in the address bar or the browser's menu. In Safari on a Mac, choose File → Add to Dock. If Tonaris is installed already, open it from your apps.",
};

export function InstallApp() {
  const shown = useInstallAdvice();
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const install = async () => {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
      // The button is gone once the offer is spent; the focus stays in the section.
      heading.current?.focus();
    }
  };

  return (
    <section aria-labelledby="install-app" className="flex max-w-sm flex-col gap-3">
      <h2
        ref={heading}
        id="install-app"
        tabIndex={-1}
        className="text-title text-fg-primary outline-none"
      >
        App
      </h2>
      <div aria-live="polite" className="flex flex-col gap-3">
        {shown === "prompt" ? (
          <>
            <p className="text-small text-fg-secondary">
              Install Tonaris to open it in its own window, from your Dock, Start menu or home
              screen.
            </p>
            {/* On a phone, a 44 px target, as Settings' other choices are (DS-15, DRIFT-093). */}
            <Button
              className="self-start max-md:h-10 max-md:px-4"
              disabled={busy}
              onClick={() => void install()}
            >
              Install Tonaris
            </Button>
          </>
        ) : (
          <p className="text-small text-fg-secondary">{advice[shown]}</p>
        )}
      </div>
    </section>
  );
}
