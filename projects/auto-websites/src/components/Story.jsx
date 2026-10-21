import { useReveal } from "../hooks/useReveal";

function Story() {
  const containerRef = useReveal(".reveal-item");

  return (
    <section className="bg-paper px-6 py-24 sm:px-10" ref={containerRef}>
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
        <div className="reveal-item relative">
          <div
            className="aspect-[4/5] overflow-hidden rounded-2xl sm:aspect-[5/4]"
            style={{ borderBottomRightRadius: "6rem" }}
          >
            <img
              src="/photos/house-exterior.jpg"
              alt="A terraced house on Kilbarry Place, Farranree, Cork"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-6 -left-6 hidden rounded-xl bg-slate px-6 py-4 shadow-lg sm:block">
            <p className="font-display text-2xl font-semibold text-paper">Farranree</p>
            <p className="text-sm text-limestone/80">Cork, T23 H0C8</p>
          </div>
        </div>

        <div className="reveal-item">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-turf">
            Based in Farranree
          </p>
          <h2 className="mt-4 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            Local, hands-on, and easy to reach.
          </h2>
          <div className="mt-6 space-y-5 leading-relaxed text-slate">
            <p>
              PB Home And Garden Design works out of Farranree, covering Cork
              city and the surrounding areas. One crew, one standard —
              whether it's a full driveway or a single fence panel.
            </p>
            <p>
              Paving, fencing, landscaping: it's all outdoor work, and it all
              gets treated the same way — proper preparation underneath,
              a clean, deliberate finish on top.
            </p>
            <p>
              Phones are answered around the clock, so a quote is never more
              than a call away.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Story;
