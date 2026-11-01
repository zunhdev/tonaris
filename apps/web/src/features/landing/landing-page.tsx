// The landing page (TON-155, DS-120) at `/welcome`, where a signed-out visit to `/` arrives: what Tonaris is, the
// workspace as it looks, How it works in four steps, What sets it apart, On your phone, and Sign in. Direction 1, "in
// the app's clothes", that the creator chose: the app's dark tokens, larger type (DS-13's landing sizes), and pictures
// drawn from the app's parts with invented albums (pictures.tsx). Rendered on the server and static.

import { LegalLinks } from "@/features/legal/legal-page";
import { Link } from "@tanstack/react-router";
import { Bot, ChevronDown, Download, FolderTree, Share2, Zap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { maxContainerDepth } from "@tonaris/domain";
import { buttonVariants } from "@tonaris/ui/components/button";
import { Logo, Wordmark } from "@tonaris/ui/components/logo";
import { cn } from "@tonaris/ui/lib/utils";

import {
  AgentsPicture,
  ExportPicture,
  FilePicture,
  FilledPicture,
  FoldersPicture,
  PastePicture,
  PhonePicture,
  PlayPicture,
  SharingPicture,
  SpeedPicture,
  WorkspacePicture,
} from "./pictures";

export const landingTitleId = "landing-title";

const width = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const primary = buttonVariants({ variant: "primary", className: "h-11 px-5 text-body" });
const secondary = buttonVariants({ variant: "secondary", className: "h-11 px-5 text-body" });
const eyebrow = "text-small font-medium tracking-[0.08em] text-accent-solid uppercase";
const card = "flex min-w-0 flex-col rounded-2xl border border-subtle bg-panel";

const services = ["Spotify", "Apple Music", "Qobuz", "Tidal", "YouTube Music"];

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-app text-body text-fg-primary">
      <Header />
      <main aria-labelledby={landingTitleId}>
        <Hero />
        <div className="mx-auto w-full max-w-[78rem] px-4 sm:px-6">
          <WorkspacePicture />
        </div>
        <HowItWorks />
        <Features />
        <OnYourPhone />
        <AndAlso />
        <Closing />
      </main>
      <footer className="border-t border-subtle">
        <div
          className={cn(
            width,
            "flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-7 text-small text-fg-tertiary",
          )}
        >
          <Wordmark className="text-fg-secondary" />
          <p className="flex-[1_1_18rem]">
            Album details from MusicBrainz and the Cover Art Archive. The albums on this page are
            invented.
          </p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

function Header() {
  const section = "text-fg-secondary hover:text-fg-primary";
  return (
    <header className="sticky top-0 z-10 border-b border-subtle bg-app/85 backdrop-blur-md">
      <div className={cn(width, "flex h-16 items-center justify-between gap-4")}>
        <Wordmark />
        <nav aria-label="Landing page" className="flex items-center gap-7">
          <span className="hidden items-center gap-7 md:flex">
            <a href="#how" className={section}>
              How it works
            </a>
            <a href="#features" className={section}>
              Features
            </a>
            <a href="#agents" className={section}>
              AI agents
            </a>
            <a href="#phone" className={section}>
              On your phone
            </a>
          </span>
          <Link
            to="/sign-in"
            className={buttonVariants({ size: "lg", className: "h-11 px-4 md:h-9 md:px-3.5" })}
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      className={cn(
        width,
        "flex flex-col items-center gap-6 pt-20 pb-16 text-center md:pt-26 md:pb-18",
      )}
    >
      <p className="flex items-center gap-2 rounded-full border border-subtle bg-panel px-3 py-1 text-small text-fg-secondary">
        <span aria-hidden className="size-1.5 rounded-full bg-accent-solid" />
        Invitation-only for now
      </p>
      <h1 id={landingTitleId} className="max-w-4xl text-hero text-balance">
        Your albums, organized your way
      </h1>
      <p className="max-w-[39rem] text-lead text-fg-secondary">
        Paste a link from your streaming service and Tonaris fills in the rest. Folders as deep as
        you like, AI agents that lend a hand, sharing on your terms, and an export that is always
        yours.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link to="/sign-in" className={primary}>
          Sign in
        </Link>
        <a href="#how" className={secondary}>
          See how it works
          <ChevronDown strokeWidth={1.75} aria-hidden />
        </a>
      </div>
      <div className="mt-5 flex flex-col items-center gap-2.5">
        <p className="text-small tracking-[0.06em] text-fg-tertiary uppercase">Paste links from</p>
        <ul className="flex flex-wrap justify-center gap-x-7 gap-y-2 font-medium text-fg-secondary">
          {services.map((service) => (
            <li key={service}>{service}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionHeading({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className={eyebrow}>{label}</p>
      <h2 id={id} className="max-w-3xl text-headline text-balance">
        {title}
      </h2>
      {children && <p className="max-w-xl text-lead text-fg-secondary">{children}</p>}
    </div>
  );
}

const steps: { title: string; text: string; picture: ReactNode }[] = [
  {
    title: "Paste a link",
    text: "From Spotify, Apple Music, Qobuz, Tidal or YouTube Music. A track link brings its album. No link? Type it in.",
    picture: <PastePicture />,
  },
  {
    title: "It fills itself in",
    text: "Title, artists, year and release type come from MusicBrainz, artwork from the Cover Art Archive. Change anything, and add fields of your own.",
    picture: <FilledPicture />,
  },
  {
    title: "File it away",
    text: "Put it in as many lists as you like, or leave it in Unsorted until you decide.",
    picture: <FilePicture />,
  },
  {
    title: "Play it where you listen",
    text: "Each album keeps its links. Open it in whichever service you are using today.",
    picture: <PlayPicture />,
  },
];

function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className={cn(width, "scroll-mt-20 pt-28 md:pt-36")}
    >
      <SectionHeading
        id="how-title"
        label="How it works"
        title="Paste a link. Tonaris does the typing."
      >
        Albums arrive with their details filled in, so your time goes into deciding where they
        belong.
      </SectionHeading>
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(({ title, text, picture }, index) => (
          <li key={title} className={cn(card, "gap-4.5 p-4 pb-5.5")}>
            {picture}
            <div className="flex flex-col gap-1.5 px-1.5">
              <span className="font-mono text-small text-accent-solid">0{index + 1}</span>
              <h3 className="text-lead font-semibold">{title}</h3>
              <p className="text-fg-secondary">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Feature({
  id,
  icon: Glyph,
  title,
  large = false,
  children,
  picture,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  large?: boolean;
  children: ReactNode;
  picture: ReactNode;
}) {
  return (
    <article id={id} className={cn(card, "scroll-mt-20 gap-5", large ? "p-7" : "p-6")}>
      <div className="flex flex-col gap-2">
        <Glyph strokeWidth={1.5} aria-hidden className="size-6 text-accent-solid" />
        <h3 className={large ? "text-page" : "text-lead font-semibold"}>{title}</h3>
        <p className="text-fg-secondary">{children}</p>
      </div>
      {picture}
    </article>
  );
}

function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={cn(width, "scroll-mt-20 pt-28 md:pt-36")}
    >
      <SectionHeading
        id="features-title"
        label="What sets it apart"
        title="Made for collections that outgrew the Library tab"
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <Feature
          icon={FolderTree}
          title="Folders within folders, and lists"
          large
          picture={<FoldersPicture />}
        >
          Nest folders up to {maxContainerDepth} levels deep, by genre, decade, label or mood. An
          album can sit in as many lists as you like, without copies.
        </Feature>
        <Feature
          id="agents"
          icon={Bot}
          title="Your AI agents, through MCP"
          large
          picture={<AgentsPicture />}
        >
          Tonaris is an MCP server. Connect Claude, ChatGPT or Codex: they read your collection, and
          with Manage collection they file and tidy it too. Moving anything to Trash waits for your
          approval.
        </Feature>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Feature icon={Share2} title="Share a folder or a list" picture={<SharingPicture />}>
          View-only, with people you invite or anyone with the link. The rest stays private. Stop
          sharing whenever you want.
        </Feature>
        <Feature icon={Download} title="Your data stays yours" picture={<ExportPicture />}>
          Download everything, Trash included, as JSON and Markdown, any time. Readable by people
          and by AI tools.
        </Feature>
        <Feature icon={Zap} title="Fast, quiet, keyboard-first" picture={<SpeedPicture />}>
          Moving around, sorting and search never wait on the network. Every action has a shortcut,
          and ⌘K finds anything.
        </Feature>
      </div>
    </section>
  );
}

function OnYourPhone() {
  return (
    <section
      id="phone"
      aria-labelledby="phone-title"
      className={cn(
        width,
        "flex scroll-mt-20 flex-wrap items-center gap-x-20 gap-y-12 pt-28 md:pt-36",
      )}
    >
      <div className="min-w-0 flex-[1_1_22rem]">
        <SectionHeading
          id="phone-title"
          label="On your phone"
          title="Your collection, in your pocket"
        >
          Browse folders and lists, search, and open an album in your streaming app. Approve what
          your agents ask for wherever you are. Add Tonaris to your Home Screen and it opens like an
          app.
        </SectionHeading>
      </div>
      <div className="flex min-w-0 flex-[0_1_20rem] justify-center">
        <PhonePicture />
      </div>
    </section>
  );
}

const more = [
  {
    title: "Custom fields",
    text: "Text, number, date, yes/no and choices: rate, tag and annotate your way.",
  },
  {
    title: "Live on every device",
    text: "A change on your laptop shows up on your phone as you make it.",
  },
  {
    title: "30 days of Trash",
    text: "Deleted something? Bring it back with its lists, for a month.",
  },
  { title: "No passwords", text: "Sign in with a code from your email, or with a passkey." },
];

function AndAlso() {
  return (
    <section aria-labelledby="also-title" className={cn(width, "pt-24")}>
      <h2 id="also-title" className="sr-only">
        And also
      </h2>
      <ul className="grid gap-7 border-t border-subtle pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {more.map(({ title, text }) => (
          <li key={title} className="flex flex-col gap-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-fg-secondary">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Closing() {
  return (
    <section
      aria-labelledby="closing-title"
      className={cn(width, "flex flex-col items-center gap-5 pt-36 pb-32 text-center")}
    >
      <Logo className="h-11 text-accent-solid" />
      <h2 id="closing-title" className="max-w-2xl text-headline text-balance">
        Your collection, the way you think about it
      </h2>
      <p className="max-w-lg text-lead text-fg-secondary">
        Tonaris is invitation-only for now. Got an invitation? Open the link in its email. Already
        in? Sign in with your email or a passkey.
      </p>
      <Link to="/sign-in" className={cn(primary, "mt-2")}>
        Sign in
      </Link>
    </section>
  );
}
