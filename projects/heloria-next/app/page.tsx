/**
 * The site.
 *
 * Six sections over one fixed canvas, top to bottom, each saying one thing
 * the ones above it have not: who we are, what Kríos does and how a round of
 * it runs, where it came from and how it ships, where it stands now,
 * the people, and how to reach them.
 * ARCHITECTURE.md is the reasoning; this is the document.
 *
 * Everything here is server-rendered. That is not an optimisation — an earlier
 * version of this site put `ssr: false` on a whole section for the sake of the
 * 3D inside it, and a crawler saw an empty element where the company's own
 * description belonged. The machine is the only thing on this page that needs
 * a browser, and it is not in this file.
 *
 * Step 1 of the build order proved the words and the column with no canvas;
 * step 2 put the machine behind them. The layout came first because a text
 * column the machine turns out to be behind is the one mistake that cannot be
 * fixed by tuning a camera.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Header, Mark } from "@/components/site/Header";
import { Stage } from "@/components/site/Stage";
import {
  Eyebrow,
  Heading,
  Item,
  Lede,
  MachineNote,
  Section,
} from "@/components/site/Section";
import { STAGES } from "@/lib/build";
import {
  nav,
  company,
  contact,
  hero,
  krios,
  meta,
  principles,
  standing,
} from "@/lib/content";

export const metadata: Metadata = {
  title: `${meta.company} — ${meta.tagline}`,
  description: meta.description,
  /* A preview until `meta.live` says otherwise — see lib/content.ts. */
  robots: { index: meta.live, follow: meta.live },
  alternates: meta.live ? { canonical: meta.url } : undefined,
};

/**
 * One stage's note, placed where its words belong in the section.
 *
 * Placed by hand rather than all at the foot of each section. The build is
 * timed against these notes and a stage may not start until the one before
 * it is seated, so two notes stacked together squeezed the second stage into
 * the last 70px of scroll — the freewheel, the point of the machine, popping
 * in on a single flick of the wheel. With the section's own list between
 * them, each stage gets a quarter of a screen or more to arrive in.
 */
function Note({ stage }: { stage: string }) {
  const i = STAGES.findIndex((x) => x.key === stage);
  const s = STAGES[i];
  return (
    <MachineNote
      stage={stage}
      index={i + 1}
      total={STAGES.length}
      title={s.title}
      caption={s.caption}
      bridge={s.bridge}
      check={s.check}
    />
  );
}

/* Two nodes rather than `owns`: schema.org's `owns` takes a Product or an
   OwnershipInfo, and a SoftwareApplication is neither — validators drop it.
   Kríos points back at the company as its publisher instead. */
const ORG_ID = `${meta.url}/#organization`;
const organization = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: meta.company,
      legalName: meta.legal.name,
      url: meta.url,
      description: meta.description,
      email: meta.email,
      address: {
        "@type": "PostalAddress",
        streetAddress: "1 Manor Close",
        addressLocality: "Mallow",
        addressRegion: "Co. Cork",
        postalCode: "P51 V8FH",
        addressCountry: "IE",
      },
      sameAs: [meta.linkedin],
      founder: company.people.map((p) => ({ "@type": "Person", name: p.name, sameAs: p.url })),
    },
    {
      "@type": "SoftwareApplication",
      name: meta.product.name,
      url: meta.product.url,
      applicationCategory: "BusinessApplication",
      publisher: { "@id": ORG_ID },
    },
  ],
};

/* The two kinds of link that are actions rather than references. Rectangular
   and quiet, as a panel switch is: the page's one solid fill is the primary,
   so there is never a question which of two buttons is the one. */
const primary =
  "group inline-flex h-11 items-center gap-3 rounded-[2px] bg-bone px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-void transition-colors hover:bg-ember";
const secondary =
  "inline-flex h-11 items-center rounded-[2px] border border-white/15 px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-bone transition-colors hover:border-white/40";

function Arrow() {
  return (
    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
      →
    </span>
  );
}

export default function Home() {
  return (
    <>
      {/* For search engines: only what the page already states. No founding
          date, address or logo URL, because none has been confirmed. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <Stage />

      {/* No z-index below 768: one here would make this a stacking context
          under the machine band (z-20), and the header's menu would open
          behind the band instead of over it. The text still passes under the
          band: with no z-index of its own it paints at layer 0, under z-20. */}
      <div className="relative md:z-10">
        <Header />

        <main>
          {/* Room for the machine band on a phone, so the hero starts below it
              rather than under it. Gone from 768 up, and gone whenever there is
              no machine — see globals.css. */}
          <div data-band-spacer aria-hidden className="h-[calc(46svh-3.25rem)] md:hidden" />

          {/* ------------------------------------------------- 1 · the hero */}
          <Section id="top" flush wide>
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <Heading as="h1">
              {hero.title[0]}
              <br />
              {hero.title[1]}
            </Heading>
            <div className="max-w-[31rem]">
              <Lede>{hero.lede}</Lede>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href={hero.primary.href} className={primary}>
                {hero.primary.label}
                <Arrow />
              </Link>
              <Link href={hero.secondary.href} className={secondary}>
                {hero.secondary.label}
              </Link>
            </div>

            <Note stage="bench" />
          </Section>

          {/* ------------------------------------------------- 2 · Kríos */}
          <Section id="krios">
            <Eyebrow>{krios.eyebrow}</Eyebrow>
            <Heading feature>{krios.title}</Heading>
            <Lede>{krios.lede}</Lede>

            <Note stage="flywheel" />

            <ol className="mt-10">
              {krios.round.map((s) => (
                <Item key={s.n} marker={s.n} name={s.name}>
                  {s.body}
                </Item>
              ))}
            </ol>

            <a href={meta.product.url} className={`${primary} mt-10`}>
              {meta.product.label}
              <Arrow />
            </a>

            <Note stage="gearing" />
          </Section>

          {/* -------------------------------------------- 3 · how we work */}
          <Section id="how">
            <Eyebrow>How we work</Eyebrow>
            <Heading>Where Kríos comes from, and how it ships.</Heading>

            <ol className="mt-10">
              {principles.map((p, i) => (
                <Item key={p.name} marker={String(i + 1).padStart(2, "0")} name={p.name}>
                  {p.body}
                </Item>
              ))}
            </ol>

            <Note stage="geneva" />
            <Note stage="corner2" />
          </Section>

          {/* ------------------------------------------ 4 · where it stands */}
          <Section id="field">
            <Eyebrow>{standing.eyebrow}</Eyebrow>
            <Heading>{standing.title}</Heading>
            <Lede>{standing.lede}</Lede>

            <Note stage="second" />

            <ul className="mt-10">
              <Item name={standing.support.name}>{standing.support.body}</Item>
              <li className="reveal grid grid-cols-[2.75rem_1fr] border-t border-white/10 py-6 last:border-b">
                <span className="pt-[3px] font-mono text-[12px] text-brass">—</span>
                <div>
                  <h3 className="font-tight text-[1.1875rem] font-normal tracking-[-0.01em] text-bone">
                    {standing.press.name}
                  </h3>
                  <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {standing.press.links.map((l) => (
                      <li key={l.href}>
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[12px] tracking-[0.04em] text-brass transition-colors hover:text-ember"
                        >
                          {l.label} ↗
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            </ul>

            <Note stage="freewheel" />
          </Section>

          {/* ----------------------------------------------- 5 · company */}
          <Section id="company" natural>
            <Eyebrow>{company.eyebrow}</Eyebrow>
            <Heading>{company.title}</Heading>

            <ul className="mt-10 border-b border-white/10">
              {company.people.map((p) => (
                <li key={p.name} className="reveal border-t border-white/10">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-4 py-5"
                  >
                    {/* Initials stand in until the photos are supplied. */}
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-kelp font-mono text-[11px] tracking-[0.06em] text-steel transition-colors group-hover:border-brass/60 group-hover:text-brass"
                    >
                      {p.name
                        .split(" ")
                        .filter((_, i, a) => i === 0 || i === a.length - 1)
                        .map((w) => w[0])
                        .join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-tight text-[1.1875rem] tracking-[-0.01em] text-bone">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
                        {p.role}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate transition-colors group-hover:text-brass"
                    >
                      LinkedIn ↗
                    </span>
                    <span className="sr-only">(LinkedIn, opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </Section>

          {/* ----------------------------------------------- 6 · contact */}
          <Section id="contact" flush>
            <Eyebrow>Contact</Eyebrow>
            <Heading>{contact.title}</Heading>
            <Lede>{contact.note}</Lede>

            {/* The address itself is the call to action: the one thing on
                the page a reader came to the bottom to take away. */}
            <a
              href={`mailto:${meta.email}`}
              className="reveal group mt-8 inline-flex items-baseline gap-3 border-b border-ember/40 pb-2 font-tight text-[clamp(1.35rem,2.4vw,1.9rem)] tracking-[-0.02em] text-bone transition-colors hover:border-ember"
            >
              {meta.email}
              <Arrow />
            </a>

            <ul className="mt-12 border-b border-white/10">
              {contact.cards.map((c) => (
                <li key={c.name} className="reveal border-t border-white/10">
                  <a
                    href={c.href}
                    className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-5"
                  >
                    <h3 className="font-tight text-[1.1875rem] font-normal tracking-[-0.01em] text-bone">
                      {c.name}
                    </h3>
                    <span className="font-mono text-[12px] tracking-[0.04em] text-brass transition-colors group-hover:text-ember">
                      {c.label} <Arrow />
                    </span>
                    <p className="col-span-2 text-[0.9375rem] leading-[1.6] text-steel">
                      {c.body}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </main>

        <footer className="border-t border-white/[0.07] bg-void">
          <div className="mx-auto grid w-full max-w-[1400px] gap-10 px-6 pb-10 pt-14 sm:px-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <p className="flex items-center gap-2.5 font-tight text-[1.0625rem] tracking-[-0.01em] text-bone">
                <Mark id="heloria-mark-footer" />
                {meta.company}
              </p>
              {/* Not the tagline: by here the reader has seen it in the title
                  and the headline. What the company makes, once, plainly. */}
              <p className="mt-4 max-w-[22rem] text-[0.9375rem] leading-[1.6] text-steel">
                Makers of {meta.product.name}, AI roleplay training for field-sales teams.
              </p>
            </div>
            <FooterList
              title="On this page"
              links={[...nav, { label: "Contact", href: "#contact" }]}
            />
            <FooterList
              title="Elsewhere"
              links={[
                { label: meta.email, href: `mailto:${meta.email}` },
                { label: meta.product.label, href: meta.product.url },
                { label: "LinkedIn", href: meta.linkedin },
              ]}
            />
          </div>
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] px-6 py-6 font-mono text-[11px] uppercase tracking-[0.14em] text-slate sm:px-10">
            <span>
              © {meta.year} {meta.legal.name}
            </span>
            {/* Companies Act 2014 s.151: name and type, place of
                registration, number and registered office. */}
            <span>
              {meta.legal.registered} · No. {meta.legal.number} · {meta.legal.office}
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}

function FooterList({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              className="text-[0.9375rem] text-steel transition-colors hover:text-bone"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
