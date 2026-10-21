import { useEffect, useRef } from "react";
import { animate, stagger } from "animejs";

export function useReveal(targetSelector, options = {}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const els = targetSelector
      ? Array.from(container.querySelectorAll(targetSelector))
      : [container];
    if (els.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      els.forEach((el) => {
        el.style.opacity = 1;
        el.style.transform = "none";
      });
      return;
    }

    els.forEach((el) => {
      el.style.opacity = 0;
    });

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      animate(els, {
        translateY: [28, 0],
        opacity: [0, 1],
        delay: stagger(100),
        duration: 750,
        ease: "outExpo",
        ...options,
      });
      observer.disconnect();
      clearTimeout(fallback);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) reveal();
      },
      { threshold: 0.2 }
    );
    observer.observe(container);

    // Safety net: if nothing ever intersects (e.g. a tool that renders the
    // full page without scrolling), reveal anyway so content is never stuck hidden.
    const fallback = setTimeout(reveal, 3000);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [targetSelector]);

  return containerRef;
}
