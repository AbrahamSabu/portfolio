import Link from "next/link";
import { meta, nav } from "@/lib/content";
import { HeaderProgress, NavLinks } from "./HeaderNav";

/**
 * Sticky, thin, and translucent over the machine.
 *
 * Sticky rather than fixed so it participates in the document flow and cannot
 * end up overlapping the first heading on a short viewport.
 *
 * Below `sm` the four links fold into a disclosure rather than disappearing:
 * the page is meant to be read in order, but a visitor who came for one thing
 * — usually Kríos, or an email address — should not have to scroll five
 * screens to find out whether it is here. `<details>` needs no script and
 * works before hydration.
 *
 * The hairline along the bottom edge is how far down the page the reader is,
 * which on this page is the same thing as how finished the machine is.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-void/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-6 px-6 py-3.5 sm:px-10">
        <Link
          href="#top"
          className="flex items-center gap-2.5 font-tight text-[0.9375rem] tracking-[-0.01em] text-bone"
        >
          <Mark />
          {meta.company}
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-8 sm:flex">
          <NavLinks />
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href="#contact"
            className="hidden h-8 items-center rounded-[2px] border border-white/15 px-3.5 font-mono text-[11px] uppercase tracking-[0.14em] text-bone transition-colors hover:border-ember hover:text-ember sm:inline-flex"
          >
            Get in touch
          </Link>

          <details className="group relative sm:hidden">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-bone [&::-webkit-details-marker]:hidden">
              Menu
              <span aria-hidden className="relative block h-2 w-3.5">
                <span className="absolute inset-x-0 top-0 h-px bg-current transition-transform group-open:translate-y-[3.5px] group-open:rotate-45" />
                <span className="absolute inset-x-0 bottom-0 h-px bg-current transition-transform group-open:-translate-y-[3.5px] group-open:-rotate-45" />
              </span>
            </summary>
            <nav
              aria-label="Sections"
              className="absolute right-0 top-11 w-56 border border-white/10 bg-well p-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            >
              {[...nav, { label: "Get in touch", href: "#contact" }].map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="block px-3 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-steel transition-colors hover:text-bone"
                >
                  {n.label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </div>
      <HeaderProgress />
    </header>
  );
}

/**
 * The Heloria flower, the company's own mark, unchanged in shape: five petals
 * on the same curve the original site draws. Two things moved to sit on this
 * site — the colour is the ember of the freewheel rollers rather than the old
 * burnt orange, and the centre is bored through like a hub, so the mark reads
 * as a part that could be mounted on one of the machine's shafts.
 */
export function Mark({
  className = "size-[18px]",
  id = "heloria-mark",
}: {
  className?: string;
  /** unique per use: two masks with one id on a page draw from the first */
  id?: string;
}) {
  return (
    <svg viewBox="-44 -44 88 88" aria-hidden className={className}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="-44" y="-44" width="88" height="88">
          <rect x="-44" y="-44" width="88" height="88" fill="white" />
          <circle r="5.5" fill="black" />
        </mask>
      </defs>
      <g fill="var(--color-ember)" mask={`url(#${id})`}>
        {[0, 72, 144, 216, 288].map((r) => (
          <path key={r} transform={`rotate(${r})`} d="M0 0 C -11 8, -13 28, 0 38 C 13 28, 11 8, 0 0 Z" />
        ))}
      </g>
    </svg>
  );
}
