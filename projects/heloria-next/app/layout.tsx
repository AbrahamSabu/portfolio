import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { meta } from "@/lib/content";

/* Loaded once here as CSS variables. Three faces, all of them used: the two
   the prototype routes needed and the site does not — Geist Sans and Space
   Grotesk — went with those routes, rather than staying on as downloads
   every visitor paid for and nothing drew with. */
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

/* The body face. PPNeueMontreal is a commercial Pangram Pangram licence, and
   the style guide names Inter as its substitute — which works because what
   actually carries that look is the weight convention, not the glyph shapes:
   headlines and body share weight 400/200 and the hierarchy comes from scale
   and tracking. Inter is variable, so 200 is a real weight here, not a faux. */
const dala = Inter({ variable: "--font-dala", subsets: ["latin"] });

/* Headings. Ventriloc's PolySans is another commercial licence; the guide names
   Inter Tight at weight 400 as the substitute, and weight 400 at display size
   is the whole point — "whisper-weight editorial authority", tight tracking
   doing the work a bold would otherwise do badly. */
const tight = Inter_Tight({ variable: "--font-tight", subsets: ["latin"] });

/* A fallback only. Every route sets its own, and `/` — the site — sets it from
   lib/content.ts so the title and the description say the same thing the page
   says. */
export const metadata: Metadata = {
  /* So the share image resolves to an absolute URL. Vercel sets the
     production domain; locally it falls back to the dev server. */
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: "Heloria Labs",
  description: meta.description,
  robots: { index: meta.live, follow: meta.live },
};

/* The browser chrome takes the page's own ground rather than flashing white
   around a dark site on mobile. */
export const viewport: Viewport = {
  themeColor: "#101315",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${dala.variable} ${tight.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
