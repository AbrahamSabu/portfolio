"use client";

import { useEffect, useRef, useState } from "react";
import { nav } from "@/lib/content";

/**
 * The header's two live parts: which section the reader is in, and how far
 * down the page they are. Split from Header so the header itself stays a
 * server component and renders complete before any of this hydrates.
 */

/** The section links, the current one lit. */
export function NavLinks() {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const ids = nav.map((n) => n.href.slice(1));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    /* A section is current while it holds the middle of the screen. The band
       is a thin line rather than a threshold so exactly one section can
       satisfy it, and between sections — the contact section is not in the
       nav — nothing is lit. */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(e.target.id);
          else setCurrent((c) => (c === e.target.id ? null : c));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    sections.forEach((s) => observer.observe(s));

    /* The phone menu is a <details>, and following an in-page link does not
       close one: it would sit open over the section it just jumped to. This
       component is mounted at every width, so it does the closing. */
    const close = () =>
      document.querySelectorAll("header details[open]").forEach((d) => d.removeAttribute("open"));
    window.addEventListener("hashchange", close);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", close);
    };
  }, []);

  return nav.map((n) => {
    const on = current === n.href.slice(1);
    return (
      <a
        key={n.href}
        href={n.href}
        aria-current={on ? "location" : undefined}
        className={[
          "font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:text-bone",
          on ? "text-bone" : "text-slate",
        ].join(" ")}
      >
        {n.label}
      </a>
    );
  });
}

/**
 * A hairline along the header's lower edge, filled to how far down the page
 * the reader is. Written to the element directly, not through state: it moves
 * every frame of a scroll and a re-render per frame is a cost for nothing.
 */
export function HeaderProgress() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <span
      ref={bar}
      aria-hidden
      className="absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-ember"
    />
  );
}
