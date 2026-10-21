import { cloneElement, useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { useReveal } from "../hooks/useReveal";

const services = [
  {
    title: "Paving & Driveways",
    copy: "Block paving, natural stone and resin driveways and patios, laid with proper falls and drainage so they still look right in five years.",
    icon: (
      <path d="M4 10 L28 10 L28 34 L4 34 Z M4 18 H28 M4 26 H28 M12 10 V18 M20 10 V18 M8 18 V26 M16 18 V26 M24 18 V26 M12 26 V34 M20 26 V34" />
    ),
  },
  {
    title: "Fencing & Boundaries",
    copy: "Timber panel, lattice-top and concrete-post fencing built to hold its line — private, secure gardens from front to back.",
    icon: (
      <path d="M4 14 Q7 9 10 14 Q13 9 16 14 Q19 9 22 14 Q25 9 28 14 M4 17 H28 M4 24 H28 M6 14 V32 M12 14 V32 M18 14 V32 M24 14 V32" />
    ),
  },
  {
    title: "Landscaping & Lawns",
    copy: "Turf and artificial lawn, planting and garden makeovers — turning an overgrown yard into space you'd actually sit out in.",
    icon: (
      <path d="M4 32 H28 M10 32 C9 27, 7 24, 6 20 M10 32 C10 27, 10 23, 10 18 M10 32 C11 27, 13 24, 14 20 M20 32 C19 27, 17 24, 16 20 M20 32 C20 27, 20 23, 20 18 M20 32 C21 27, 23 24, 24 20" />
    ),
  },
];

function Services() {
  const containerRef = useReveal(".reveal-item");
  const iconRefs = useRef([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = iconRefs.current.filter(Boolean);

    paths.forEach((p) => {
      const length = p.getTotalLength();
      p.style.strokeDasharray = length;
      p.style.strokeDashoffset = reduced ? 0 : length;
    });

    if (reduced) return;

    let done = false;
    const draw = () => {
      if (done) return;
      done = true;
      animate(paths, {
        strokeDashoffset: 0,
        duration: 900,
        delay: stagger(150, { start: 150 }),
        ease: "outExpo",
      });
      observer.disconnect();
      clearTimeout(fallback);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) draw();
      },
      { threshold: 0.3 }
    );
    observer.observe(container);
    const fallback = setTimeout(draw, 3000);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return (
    <section id="services" className="bg-paper px-6 py-24 sm:px-10" ref={containerRef}>
      <div className="mx-auto max-w-6xl">
        <div className="reveal-item max-w-2xl">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-turf">
            What we do
          </p>
          <h2 className="mt-4 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            Outdoor work, done properly.
          </h2>
        </div>

        <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <div key={s.title} className="reveal-item group">
              <svg
                viewBox="0 0 32 40"
                className="h-10 w-8 stroke-turf transition-transform duration-300 group-hover:-translate-y-1"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {cloneElement(s.icon, { ref: (el) => (iconRefs.current[i] = el) })}
              </svg>
              <h3 className="mt-5 font-display text-xl font-semibold text-ink">
                {s.title}
              </h3>
              <p className="mt-3 leading-relaxed text-slate">{s.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Services;
