import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import CurveDivider from "./CurveDivider";

function Hero() {
  const curveRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      document.querySelectorAll(".hero-in").forEach((el) => {
        el.style.opacity = 1;
        el.style.transform = "none";
      });
      if (curveRef.current) curveRef.current.style.strokeDashoffset = 0;
      return;
    }

    const path = curveRef.current;
    if (path) {
      const length = path.getTotalLength();
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      animate(path, {
        strokeDashoffset: [length, 0],
        duration: 1600,
        delay: 300,
        ease: "outExpo",
      });
    }

    animate(".hero-in", {
      translateY: [26, 0],
      opacity: [0, 1],
      delay: stagger(110, { start: 200 }),
      duration: 900,
      ease: "outExpo",
    });

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const offset = Math.min(window.scrollY * 0.15, 50);
        if (imgRef.current) {
          imgRef.current.style.transform = `translateY(${offset}px) scale(1.12)`;
        }
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative flex min-h-screen flex-col justify-end overflow-hidden bg-ink">
      <img
        ref={imgRef}
        src="/photos/curved-pathway.jpg"
        alt="A curved slate-grey stone pathway cut through a Cork back garden lawn, built by PB Home And Garden Design"
        className="absolute inset-0 h-full w-full object-cover object-[70%_30%] will-change-transform"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/80 to-ink/30" />
      <div className="absolute inset-0 bg-ink/25" />

      <svg
        className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          ref={curveRef}
          d="M 1380 70 C 1220 220, 1290 360, 1120 460 C 980 540, 1010 660, 890 780"
          stroke="var(--color-turf-light)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-28 pt-40 sm:px-10">
        <p className="hero-in font-display text-sm font-semibold uppercase tracking-[0.25em] text-turf-light opacity-0">
          Farranree, Cork &middot; Open 24/7
        </p>

        <h1 className="hero-in mt-5 max-w-3xl font-display text-[2.6rem] font-medium leading-[1.05] tracking-tight text-paper opacity-0 sm:text-6xl md:text-7xl">
          One clean curve, <span className="text-turf-light">every</span> garden.
        </h1>

        <p className="hero-in mt-6 max-w-xl text-lg leading-relaxed text-limestone/90 opacity-0">
          PB Home And Garden Design builds paving, fencing and landscaping across
          Cork — driveways, patios and back gardens finished the way we'd want
          them in our own.
        </p>

        <div className="hero-in mt-9 flex flex-wrap items-center gap-5 opacity-0">
          <a
            href="tel:0851170026"
            className="inline-flex items-center gap-2 rounded-full bg-turf-light px-7 py-3.5 font-display text-base font-semibold text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-paper hover:shadow-xl active:translate-y-0"
          >
            Call 085 117 0026
          </a>
          <span className="text-sm text-limestone/80">
            No callout charge &middot; quotes anytime
          </span>
        </div>
      </div>

      <CurveDivider fill="var(--color-paper)" className="relative z-10" />
    </section>
  );
}

export default Hero;
