/**
 * One source of truth for every word on the site.
 *
 * The facts are carried over unchanged from the current site and the botanical
 * build — what the company does, the principles, what
 * Kríos is, who the founders are. What changed is the register: the plant
 * metaphor ("Plant / Grow / Bloom", "Software that blooms", "Our first bloom")
 * is gone, replaced by the vocabulary the live site already uses for itself —
 * Build / Run / Hold, "We build our own software and run it ourselves".
 * Nothing here claims anything the company has not already claimed about
 * itself, and every line still needs sign-off before it ships.
 */

export const meta = {
  company: "Heloria Labs",
  tagline: "We build our own software and run it ourselves.",
  description:
    "Heloria Labs is a Cork software company. We build Kríos, AI roleplay training for field-sales teams.",
  email: "contact@helorialabs.com",
  linkedin: "https://www.linkedin.com/company/heloria-labs/",
  product: { name: "Kríos", url: "https://krios.ie", label: "krios.ie" },
  year: 2026,
  /**
   * The statutory particulars. Companies Act 2014 s.151 requires a company's
   * website to show its name and type, where it is registered, its number and
   * its registered office. Taken from the footer of krios.ie, which the
   * company already publishes.
   */
  legal: {
    name: "Heloria Labs Limited",
    registered: "Registered in Ireland",
    number: "821585",
    office: "1 Manor Close, Mallow, Co. Cork, P51 V8FH",
  },
  /** Where the site lives once it replaces the current one. */
  url: "https://www.helorialabs.com",
  /**
   * The launch switch. False while this is a preview at heloria-next.vercel.app
   * and www.helorialabs.com still serves the old site: indexing the preview
   * would put two Heloria sites in search, competing. Set true when the domain
   * points here — robots, sitemap and canonical all follow it.
   */
  live: false,
};

/**
 * Four of the six sections, not all of them.
 *
 * The hero and the contact section are arrived at rather than navigated to.
 */
export const nav = [
  { label: "Kríos", href: "#krios" },
  { label: "How we work", href: "#how" },
  { label: "Where it stands", href: "#field" },
  { label: "Company", href: "#company" },
];

/*
 * Each section below says one thing the sections above it have not. An
 * earlier draft said "we build it and run it ourselves", "a long horizon"
 * and "led by its founders" five times each, in five sections, and never
 * once showed what Kríos actually does. If a line here restates one above
 * it, cut it; if a section has nothing new left, cut the section.
 */

export const hero = {
  eyebrow: "Independent software · Cork, Ireland",
  title: ["We build our own software", "and run it ourselves."],
  lede: "Our first product is Kríos: AI roleplay training for field-sales teams.",
  primary: { label: "See how Kríos works", href: "#krios" },
  secondary: { label: "How we work", href: "#how" },
};

export const krios = {
  eyebrow: "First product · Kríos",
  title: "No rep should hear an objection for the first time at a door.",
  lede: "So reps meet the hard objections in practice, before they meet them in the field. A practice round runs like this.",
  /** One practice round, in order. */
  round: [
    { n: "01", name: "The AI plays the buyer", body: "Built from your own customers, objections and accent. It pushes back the way real ones do." },
    { n: "02", name: "The rep answers out loud", body: "As they would at a door or on a forecourt, and the AI reacts to what they actually say." },
    { n: "03", name: "Scored and debriefed", body: "Every session is scored on rapport, objection handling, discovery, brevity and delivery. Nyx, the AI coach, debriefs it: the moment that turned it and the one thing to fix next. Managers see rep scorecards and the objections hurting the team." },
  ],
};

/**
 * Two, and each one checkable. The first is the company's own history (Tie
 * Towel, from the ThinkBusiness and Education Awards coverage); the second is
 * the release rule the Geneva note is built on.
 *
 * The machine quotes these by position (lib/build.ts): `principles[0].name`
 * in the bench note and `principles[1].name` in the Geneva note — keep "Whole
 * steps only" in slot 1, and keep it the item printed directly above that
 * note. A third principle, "Owned end to end", said the hero headline again
 * and was cut.
 */
export const principles = [
  {
    name: "We sold door to door first",
    body: "Before Kríos, all three of us were on the five-student team behind Tie Towel, a door-to-door company in the Student Enterprise programme. It made €4,000 in sales and placed third nationally. Kríos started on a walk back through one of the estates we used to sell in, with one question: how do we actually train people to do this well?",
  },
  {
    name: "Whole steps only",
    body: "A feature ships when it works end to end, or it waits for the next release.",
  },
];

/**
 * Where Kríos is now. Replaces "The long game", which described products
 * becoming their own companies — a process no product here has been through.
 * Everything below is in the published coverage or on krios.ie.
 *
 * `standing.title` is quoted word for word by the freewheel's note: the part
 * that lets the motion go, beside the line that says the product is out.
 */
export const standing = {
  eyebrow: "Where it stands",
  title: "Kríos is out in the field.",
  lede: "It is in pilot programmes with its first customers.",
  support: {
    name: "Supported by",
    body: "An ElevenLabs Start-up Grant, the Google for Startups Cloud Program, Republic of Work, Tech Industry Alliance and Cork Local Enterprise Office.",
  },
  press: {
    name: "In the press",
    links: [
      {
        label: "Irish Independent",
        href: "https://www.independent.ie/irish-news/teen-tech-entrepreneurs-already-attracting-business-interest-months-before-their-leaving-cert/a/161045785.html",
      },
      {
        label: "ThinkBusiness",
        href: "https://www.thinkbusiness.ie/articles/cork-teen-founders-launch-krios-ai-sales-training-platform/",
      },
      {
        label: "The Education Awards",
        href: "https://educationawards.ie/news/cork-teenage-founders-launch-krios-ai-sales-training-platform-targeting-outbound-sales-teams",
      },
    ],
  },
};

export const company = {
  eyebrow: "Company",
  title: "Built and led by its founders.",
  people: [
    {
      name: "Michael Sweeney Heffernan",
      role: "Founder · Director",
      url: "https://www.linkedin.com/in/michael-sweeney-heffernan-589155354",
    },
    {
      name: "Abraham Sabu Kurian",
      role: "Founder",
      url: "https://www.linkedin.com/in/abraham-sabu-kurian/",
    },
    {
      name: "Ahroon Cyriac Santhosh",
      role: "Founder",
      url: "https://www.linkedin.com/in/ahroon-santhosh/",
    },
  ],
};

export const contact = {
  title: "Get in touch.",
  note: "We read everything.",
  cards: [
    {
      name: "About Kríos",
      body: "The product itself, or bringing it to a field-sales team.",
      label: "krios.ie",
      href: "https://krios.ie",
    },
    {
      name: "Elsewhere",
      body: "The company page, if you would rather follow along there.",
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/heloria-labs/",
    },
  ],
};
