import { useEffect, useRef, useState } from "react";

function Transform() {
  const wrapperRef = useRef(null);
  const afterRef = useRef(null);
  const beforeLabelRef = useRef(null);
  const afterLabelRef = useRef(null);
  const hintRef = useRef(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const wrapper = wrapperRef.current;
    const after = afterRef.current;
    if (!wrapper || !after) return;

    let radiusCap = Math.hypot(window.innerWidth, window.innerHeight) * 0.6;
    let ticking = false;

    const update = () => {
      const rect = wrapper.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress =
        scrollable > 0 ? Math.min(Math.max(-rect.top / scrollable, 0), 1) : 0;

      const radius = 50 + progress * radiusCap;
      after.style.clipPath = `circle(${radius}px at 50% 55%)`;

      if (beforeLabelRef.current) {
        beforeLabelRef.current.style.opacity = String(Math.max(1 - progress * 3.5, 0));
      }
      if (afterLabelRef.current) {
        afterLabelRef.current.style.opacity = String(Math.max((progress - 0.6) * 3, 0));
      }
      if (hintRef.current) {
        hintRef.current.style.opacity = String(Math.max(1 - progress * 6, 0));
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };
    const onResize = () => {
      radiusCap = Math.hypot(window.innerWidth, window.innerHeight) * 0.6;
      onScroll();
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  if (reduced) {
    return (
      <section className="bg-ink px-6 py-24 sm:px-10">
        <div className="mx-auto max-w-6xl">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-turf-light">
            The transformation
          </p>
          <h2 className="mt-4 font-display text-4xl font-medium tracking-tight text-paper sm:text-5xl">
            Rough ground to finished garden.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="overflow-hidden rounded-2xl">
              <img
                src="/photos/dark-slab-patio.jpg"
                alt="A back garden mid-project, with rough ground and building materials"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="overflow-hidden rounded-2xl">
              <img
                src="/photos/circular-patio.jpg"
                alt="A finished circular patio with artificial lawn and curved path"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={wrapperRef} className="relative h-[280vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-ink">
        <img
          src="/photos/dark-slab-patio.jpg"
          alt="A back garden mid-project: rough ground and building materials before the finish is laid"
          className="absolute inset-0 h-full w-full object-cover object-[30%_5%]"
        />
        <div className="absolute inset-0 bg-ink/20" />
        <img
          ref={afterRef}
          src="/photos/circular-patio.jpg"
          alt="A finished circular patio with artificial lawn and curved path"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: "circle(50px at 50% 55%)" }}
        />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <p
            ref={beforeLabelRef}
            className="absolute text-center font-display text-3xl font-medium text-paper [text-shadow:0_2px_20px_rgb(0_0_0_/_0.6)] sm:text-5xl"
          >
            Rough ground.
          </p>
          <p
            ref={afterLabelRef}
            className="absolute text-center font-display text-3xl font-medium text-paper opacity-0 [text-shadow:0_2px_20px_rgb(0_0_0_/_0.6)] sm:text-5xl"
          >
            Finished garden.
          </p>
        </div>

        <p
          ref={hintRef}
          className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-xs font-semibold uppercase tracking-[0.3em] text-limestone/70"
        >
          Keep scrolling
        </p>
      </div>
    </section>
  );
}

export default Transform;
