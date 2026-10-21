import { useReveal } from "../hooks/useReveal";

function Contact() {
  const containerRef = useReveal(".reveal-item");

  return (
    <section id="contact" className="bg-slate px-6 py-24 sm:px-10" ref={containerRef}>
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="reveal-item">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-turf-light">
              Get a quote
            </p>
            <h2 className="mt-4 font-display text-4xl font-medium tracking-tight text-paper sm:text-5xl">
              Ring anytime — we're open 24/7.
            </h2>
            <p className="mt-6 max-w-md leading-relaxed text-limestone/80">
              Describe the job, get a straight answer. No callout charge,
              no obligation.
            </p>

            <a
              href="tel:0851170026"
              className="mt-9 inline-flex items-center gap-3 rounded-full bg-turf-light px-8 py-4 font-display text-lg font-semibold text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-paper hover:shadow-xl active:translate-y-0"
            >
              085 117 0026
            </a>
          </div>

          <div className="reveal-item flex flex-col justify-center gap-8 border-t border-paper/15 pt-10 lg:border-t-0 lg:border-l lg:pl-14 lg:pt-0">
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-turf-light">
                Hours
              </p>
              <p className="mt-2 text-xl text-paper">Open 24 hours, every day</p>
            </div>
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-turf-light">
                Address
              </p>
              <p className="mt-2 text-xl text-paper">
                144 Kilbarry Place, Farranree
                <br />
                Cork, T23 H0C8, Ireland
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Contact;
