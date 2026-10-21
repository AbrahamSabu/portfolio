/**
 * The shell every section on the page shares.
 *
 * There is exactly one layout decision on this site and it is made here: the
 * machine is rendered full-bleed behind the whole document, so every word has
 * to sit in a column that the machine is not behind. On a wide screen that
 * column is the left half; on a phone it is the bottom, because a
 * left-to-right scrim on a narrow screen has to be opaque nearly all the way
 * across to stay legible, and what that leaves is a sliver of machine and a
 * reader wondering where it went.
 *
 * Sections are tall — a screen and a half — because the machine assembles
 * across them and assembly needs scroll distance to happen in. They are not
 * `h-screen`: a section that is exactly a viewport tall cannot be read on a
 * short laptop in landscape, and this is a page of paragraphs.
 */

import type { ReactNode } from "react";

export function Section({
  id,
  children,
  /** The first and last sections carry their own spacing. */
  flush,
  /** The hero only: a wider column for a display-size headline. */
  wide,
  /** After the build is finished: no scroll distance to hold open. */
  natural,
}: {
  id: string;
  children: ReactNode;
  flush?: boolean;
  wide?: boolean;
  natural?: boolean;
}) {
  return (
    <section
      id={id}
      /* `scroll-mt` because the header is sticky: without it an anchor jump
         lands with the heading underneath the header. */
      /* The section itself is the flex container. It was an inner div with
         `min-h-[inherit]`, which does nothing: `inherit` takes the parent's
         computed value, the parent had no min-height, and the text sat at the
         top of every section instead of the middle of it. */
      className={[
        "relative flex scroll-mt-20",
        /* The first and last sections are not held open on a phone: the hero
           starts right under the machine band instead of half a screen below
           it, and the contact section ends where its content does. */
        flush
          ? "items-start py-12 md:min-h-[86svh] md:items-center md:py-24"
          : natural
            ? "items-center py-24 md:py-36"
            : "min-h-[120svh] items-center py-28",
      ].join(" ")}
    >
      {/* The text column. The left half on a wide screen and the whole of it
          on a phone, where the machine is above rather than behind. */}
      <div className="mx-auto w-full max-w-[1400px] px-6 sm:px-10">
        {/* One width, every section, including the hero.

            The hero was given a wider column so its two written lines would
            fit, and then measuring showed the text running 112px into the
            space the machine is framed in — which the wash can only fix by
            covering the machine. A column that changes width down a page reads
            as a mistake anyway. The heading scales to the column instead. */}
        {/* The hero alone is wider, and only by as much as its first frame
            allows: at that point the machine is a plate and some shafts at
            the far side of the well, not a part swinging near the edge. */}
        <div
          className={
            wide
              ? "max-w-[40rem] md:max-w-[min(40rem,44vw)]"
              : "max-w-[34rem] md:max-w-[min(31rem,46vw)]"
          }
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * The small mono line above a heading.
 *
 * It is a label, not a heading, so it is a `<p>`. Screen readers announcing
 * "heading level 3: First product" before "heading level 2: Kríos" is the
 * usual cost of styling one of these as a heading because it looks like one.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="reveal flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.16em] text-slate">
      <span aria-hidden className="h-px w-6 bg-brass/70" />
      {children}
    </p>
  );
}

/** A section heading. One size, set by scale and tracking rather than weight. */
export function Heading({
  children,
  as: As = "h2",
  /** One step up from the other h2s: the section the page is for. */
  feature,
}: {
  children: ReactNode;
  as?: "h1" | "h2";
  feature?: boolean;
}) {
  return (
    <As
      className={[
        "reveal mt-6 font-tight font-normal text-bone [text-wrap:balance]",
        /* Clamped rather than stepped at a breakpoint. The h1 is two written
           lines with a hard break between them, so the only thing that decides
           whether it reads as two lines or four is whether the longer of them
           fits the column — and a size that jumps at 640px gets that wrong on
           every width in between. */
        As === "h1"
          ? /* Sized to the column, not the screen: the longer written line
               is 10.5em wide at this tracking, so the size is the column's
               width over ~10.8 — the largest it can be and stay two lines. */
            "text-[min(2.6rem,calc((100vw-3rem)/11.2))] leading-[1.02] tracking-[-0.035em] sm:text-[min(3rem,calc((100vw-5rem)/11.2))] md:text-[min(4.25rem,4.05vw)]"
          : feature
            ? "text-[clamp(2rem,3.7vw,3.25rem)] leading-[1.06] tracking-[-0.03em]"
            : "text-[clamp(1.9rem,3.2vw,2.75rem)] leading-[1.08] tracking-[-0.028em]",
      ].join(" ")}
    >
      {children}
    </As>
  );
}

/** The paragraph under a heading. */
export function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="reveal mt-6 text-[1.0625rem] leading-[1.65] text-steel md:text-[1.125rem]">
      {children}
    </p>
  );
}

/**
 * A numbered or named item in a list of them.
 *
 * Ruled rather than boxed. Cards on top of a rendered machine are two
 * competing surfaces; a hairline rule reads as annotation, which is what these
 * are — and annotation is the register the whole page is written in.
 */
export function Item({
  marker,
  name,
  children,
}: {
  marker?: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <li className="reveal grid grid-cols-[2.75rem_1fr] border-t border-white/10 py-6 last:border-b">
      <span className="pt-[3px] font-mono text-[12px] tabular-nums tracking-[0.08em] text-brass">
        {marker ?? "—"}
      </span>
      <div>
        <h3 className="font-tight text-[1.1875rem] font-normal tracking-[-0.01em] text-bone">
          {name}
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-[1.6] text-steel">
          {children}
        </p>
      </div>
    </li>
  );
}

/**
 * What the machine beside the text just did, and how to check it.
 *
 * An aside, set apart by a warm rule, because it is about the machine rather
 * than the company — and a reader has to be able to tell which of the two a
 * sentence is talking about, or the whole page becomes the forced analogy it
 * was rebuilt to avoid.
 *
 * Absent under reduced motion. There is no machine for those readers, and a
 * note inviting them to scroll at something that is not there is a note about
 * nothing. Everything the page says about the company is in the section above
 * it, not in here.
 */
export function MachineNote({
  stage,
  title,
  caption,
  bridge,
  check,
  index,
  total,
}: {
  /** which stage of the build this note times — see `readingFrom` */
  stage: string;
  /** 1-based position in the build, for the counter */
  index: number;
  total: number;
  title: string;
  caption: string;
  bridge?: string;
  check?: string;
}) {
  return (
    <aside
      data-stage={stage}
      aria-label={`On the machine: ${title}`}
      className="mt-12 rounded-[2px] border border-white/[0.07] bg-well/70 px-5 py-4 backdrop-blur-sm motion-reduce:hidden"
    >
      <div className="flex items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.16em]">
        <span className="flex items-center gap-2 text-brass">
          <span aria-hidden className="size-1.5 rounded-full bg-ember" />
          {title}
        </span>
        <span className="tabular-nums text-slate">
          Stage {index}/{total}
        </span>
      </div>
      <p className="mt-3 text-[0.875rem] leading-[1.65] text-slate">{caption}</p>
      {bridge ? (
        <p className="mt-3 text-[0.9375rem] leading-[1.6] text-bone">{bridge}</p>
      ) : null}
      {check ? (
        <p className="mt-4 border-t border-white/[0.07] pt-3 font-mono text-[12px] leading-[1.55] tracking-[0.02em] text-ember">
          {check}
        </p>
      ) : null}
    </aside>
  );
}
