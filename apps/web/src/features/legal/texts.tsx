// The terms of use and the privacy notice (TON-131), as `termsVersion` dates them. YouTube's Developer Policies
// (III.A) ask for both: terms that bind people to YouTube's Terms of Service, and a notice that says Tonaris uses
// YouTube API Services, links to Google's Privacy Policy, and says what is kept. The notice names zunh.dev, as the
// creator chose (31 October 2026), and carries TS-114's backup wording as written. Changing either text means a new
// `termsVersion`, which asks every member again.

import type { ReactNode } from "react";

import { termsVersion } from "@tonaris/domain";

const updated = new Date(`${termsVersion}T12:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-title text-fg-primary">{title}</h2>
      {children}
    </section>
  );
}

function Outside({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-solid underline underline-offset-4"
    >
      {children}
    </a>
  );
}

/** The support address as a link, or words that stand in while it can't be loaded. */
function Support({ email }: { email: string | undefined }) {
  if (!email) return <>the support address on Tonaris's help page</>;
  return (
    <a
      href={`mailto:${email}`}
      className="[overflow-wrap:anywhere] text-accent-solid underline underline-offset-4"
    >
      {email}
    </a>
  );
}

export const youtubeTermsUrl = "https://www.youtube.com/t/terms";
export const googlePrivacyUrl = "https://policies.google.com/privacy";

export function Updated() {
  return <p className="text-small text-fg-secondary">Last updated {updated}</p>;
}

export function TermsText({ support }: { support: string | undefined }) {
  return (
    <>
      <p>
        Tonaris is a free hobby service for keeping a music collection, run by zunh.dev. By using
        it, you agree to these terms and to the{" "}
        <a href="/privacy" className="text-accent-solid underline underline-offset-4">
          privacy notice
        </a>
        .
      </p>
      <Section title="The service">
        <p>
          Membership is by invitation. Tonaris is offered as it is, without guarantees. It may
          change, pause or end; before it ends, you'll be told in time to export your collection.
        </p>
      </Section>
      <Section title="Your collection">
        <p>
          What you add stays yours. You let Tonaris store it and show it to the people you share it
          with. You can export it at any time in Settings → Data, and delete it with your account.
        </p>
      </Section>
      <Section title="Fair use">
        <p>
          Don't use Tonaris to break the law, harass anyone, publish other people's private data, or
          overload or attack the service. An account that does may be suspended or removed.
        </p>
      </Section>
      <Section title="Other services">
        <p>
          Tonaris links to Spotify, Apple Music, Qobuz, Tidal and YouTube Music, and describes
          albums with data from MusicBrainz. Each has its own terms.
        </p>
        <p>
          Tonaris uses YouTube API Services. By using Tonaris, you agree to be bound by the{" "}
          <Outside href={youtubeTermsUrl}>YouTube Terms of Service</Outside>.
        </p>
      </Section>
      <Section title="Liability">
        <p>
          As far as the law allows, zunh.dev isn't liable for lost data or other harm from using
          Tonaris. Keep an export of anything you can't afford to lose.
        </p>
      </Section>
      <Section title="Changes and questions">
        <p>
          If these terms change, Tonaris asks you to agree again before you go on. Questions: write
          to <Support email={support} />.
        </p>
      </Section>
    </>
  );
}

export function PrivacyText({ support }: { support: string | undefined }) {
  return (
    <>
      <p>
        Tonaris is a hobby service for keeping a music collection, run by zunh.dev. This notice says
        what Tonaris keeps about you, where, and for how long. For questions or requests, write to{" "}
        <Support email={support} />.
      </p>
      <Section title="What Tonaris keeps">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong className="font-medium text-fg-primary">Your account:</strong> your email
            address, the display name you choose, and when you agreed to these terms.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Your collection:</strong> albums with
            their links and artwork addresses, lists, folders, custom fields, descriptions, and how
            you arrange and view them.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Sharing:</strong> the addresses you
            invite, who accepted, and your share links.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Signing in:</strong> your sessions, each
            with the browser it's in; sign-in codes until they're used or expire; and the apps you
            connected, such as an AI assistant, with what you approved for them.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Passkeys,</strong> if you add any: each
            one's public key, its name, the password manager it's in when that's known, and when you
            added it. Your face, fingerprint or PIN is checked on your device and never reaches
            Tonaris.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Records for safety:</strong> a log of
            account changes, such as a new email address or a deletion, and a list of deletions by
            ID only, so restoring a backup never brings deleted data back.
          </li>
        </ul>
        <p>
          Tonaris shows no ads, uses no analytics, doesn't track you on other sites, and never sells
          or shares your data for marketing.
        </p>
      </Section>
      <Section title="On your device">
        <p>
          Tonaris sets one cookie, which keeps you signed in, and a second for 5 minutes when you
          open the sign-in page or add a passkey, so a passkey can sign you in. Your browser also
          keeps a copy of your collection and any changes not yet saved, so Tonaris loads quickly
          and works offline. Signing out removes them.
        </p>
      </Section>
      <Section title="Services Tonaris runs on">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <strong className="font-medium text-fg-primary">Render</strong> runs Tonaris's servers
            and database, with its backups, in Frankfurt, Germany.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Cloudflare</strong> answers for
            Tonaris's addresses, secures connections, caches album artwork, and keeps the list of
            deletions.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Resend</strong> sends Tonaris's email,
            such as sign-in codes and invitations. It sends from Ireland, and keeps account data and
            logs in the US, under the EU–US Data Privacy Framework and standard contractual clauses.
          </li>
          <li>
            <strong className="font-medium text-fg-primary">Sentry</strong> receives reports of
            errors, in its EU region, without your email address, cookies or what you typed.
          </li>
        </ul>
      </Section>
      <Section title="The feedback board">
        <p>
          Tonaris's feedback board, at feedback.tonaris.app, runs on Fider, a service of Northern
          App Labs. If you sign in to it with Tonaris, it receives your display name and email
          address. Anyone can read what you post and comment there, with your name but never your
          email. Deleting your Tonaris account doesn't remove them: delete them, or your account
          there, in the board's settings.
        </p>
      </Section>
      <Section title="Where album details come from">
        <p>
          When you add a link, Tonaris's server asks MusicBrainz and the Cover Art Archive about the
          album, and, depending on the link, Apple's iTunes lookup, Spotify, Qobuz's or Tidal's
          album page, or YouTube. They receive the link, or the album's title and artist, from
          Tonaris's server: never your name, email or IP address.
        </p>
        <p>
          Tonaris uses YouTube API Services to identify YouTube Music links. It reads an album's
          title, artist, release date and track count from the YouTube Data API only to find the
          album in MusicBrainz, and keeps nothing YouTube returns. YouTube's data is covered by the{" "}
          <Outside href={googlePrivacyUrl}>Google Privacy Policy</Outside>.
        </p>
      </Section>
      <Section title="How long">
        <p>
          Your account and collection are kept until you delete them. Deleted data is removed from
          the live service immediately and disappears from encrypted backups within 30 days. If we
          ever restore a backup, your deletion is re-applied before the service reopens.
        </p>
      </Section>
      <Section title="Your choices">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Export your collection at any time in Settings → Data.</li>
          <li>Change your email address, or delete your account, in Settings → Account.</li>
          <li>
            For anything else, such as a copy of what's kept, a correction or an objection, write to{" "}
            <Support email={support} />. In the EU or the UK, you can also complain to your data
            protection authority.
          </li>
        </ul>
      </Section>
      <Section title="Changes">
        <p>If this notice changes, Tonaris asks you to agree again before you go on.</p>
      </Section>
    </>
  );
}
