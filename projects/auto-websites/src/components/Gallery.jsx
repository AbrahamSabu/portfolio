import { useReveal } from "../hooks/useReveal";

const photos = [
  {
    src: "/photos/dark-slab-patio.jpg",
    alt: "Charcoal porcelain patio slabs laid against a rendered house wall, Cork",
    label: "Porcelain patio",
    span: "lg:col-span-2 lg:row-span-2",
    aspect: "aspect-[4/3] lg:aspect-auto lg:h-full",
  },
  {
    src: "/photos/circular-patio.jpg",
    alt: "Circular paved patio feature with artificial lawn and curved path",
    label: "Patio & artificial lawn",
    span: "",
    aspect: "aspect-[4/3]",
  },
  {
    src: "/photos/stone-patio-furniture.jpg",
    alt: "Light natural stone patio with rattan garden furniture and lawn edge",
    label: "Natural stone patio",
    span: "",
    aspect: "aspect-[4/3]",
  },
  {
    src: "/photos/fencing.jpg",
    alt: "New lattice-top timber fence panels with concrete posts along a garden boundary",
    label: "Lattice-top fencing",
    span: "lg:col-span-3",
    aspect: "aspect-[16/7]",
  },
];

function Gallery() {
  const containerRef = useReveal(".reveal-item");

  return (
    <section id="work" className="bg-limestone px-6 py-24 sm:px-10" ref={containerRef}>
      <div className="mx-auto max-w-6xl">
        <div className="reveal-item max-w-2xl">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-turf">
            Recent work
          </p>
          <h2 className="mt-4 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            Real gardens, real jobs.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2">
          {photos.map((p) => (
            <div
              key={p.src}
              className={`reveal-item group relative overflow-hidden rounded-2xl ${p.span} ${p.aspect}`}
            >
              <img
                src={p.src}
                alt={p.alt}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/0 to-ink/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <p className="absolute bottom-4 left-5 translate-y-2 font-display text-sm font-semibold text-paper opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                {p.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Gallery;
