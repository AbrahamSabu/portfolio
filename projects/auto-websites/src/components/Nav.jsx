import { useEffect, useState } from "react";

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-paper/10 bg-ink/85 py-2.5 shadow-lg backdrop-blur-md"
          : "border-transparent bg-ink/60 py-4 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 sm:px-10">
        <a href="#top" className="flex items-center gap-2.5 font-display text-sm font-semibold text-paper sm:text-base">
          <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-turf-light" fill="none" strokeWidth="2.5" strokeLinecap="round">
            <path d="M3 17 C 10 17, 10 8, 17 8 L 17 4 M 17 8 L 21 8" />
          </svg>
          <span className="hidden sm:inline">PB Home And Garden Design</span>
          <span className="sm:hidden">PB Home &amp; Garden</span>
        </a>
        <a
          href="tel:0851170026"
          className="rounded-full bg-turf-light px-4 py-2 font-display text-sm font-semibold text-ink transition duration-300 hover:-translate-y-0.5 hover:bg-paper hover:shadow-lg active:translate-y-0"
        >
          085 117 0026
        </a>
      </div>
    </header>
  );
}

export default Nav;
