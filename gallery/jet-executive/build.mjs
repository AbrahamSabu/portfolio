/* Generates the static site. Run: node build.mjs <outdir>
   Emits plain HTML — no runtime dependency on this script. */
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || "dist";
const MORPH = JSON.parse(fs.readFileSync(new URL("./morph-data.json", import.meta.url), "utf8"));
const MORPH_STATIC = fs.readFileSync(new URL("./morph-static.html", import.meta.url), "utf8");
const SITE = "https://jetexecutivetravel.ie";

const BIZ = {
  name: "Jet Executive Travel",
  tagline: "Every detail, done in style",
  tel: "+353 87 623 9810",
  telHref: "+353876239810",
  tel2: "+353 85 122 5684",
  tel2Href: "+353851225684",
  email: "info@jetexecutivetravel.ie",
  street: "69 The Paddocks, Hybreasal, South Circular Road",
  area: "Kilmainham",
  city: "Dublin 8",
  postal: "D08 C674",
  country: "IE",
  reviews: 117,
  facebook: "https://www.facebook.com/jetexecutivetravel/",
  linkedin: "https://www.linkedin.com/company/jet-executive-travel/",
  video: "rrYixrqJ7jc",
};

/* Anything the business must confirm before going live is rendered as a
   visible TODO chip rather than an invented value. */
const todo = (label) => `<span class="todo">${label}</span>`;

const SERVICES = [
  {
    slug: "airport-transfers",
    vehicle: "E-Class as standard. Ask for the S-Class if you are collecting a client rather than arriving yourself, or the Sprinter if the whole team is landing together.",
    nav: "Airport transfers",
    title: "Dublin Airport chauffeur transfers",
    kicker: "Transfers",
    blurb: "Flight-tracked pickups, meet and greet in arrivals, and a fixed fare agreed before you travel.",
    img: "airport-quays",
    heroImg: "kerbside",        // portrait crops read badly in a wide page hero
    imgRatio: "portrait",
    alt: "A chauffeur holding the rear door of a black Mercedes-Benz E-Class for a client on the Liffey quays in Dublin",
    lede: "The journey people judge you on is the one at either end of the flight. We track the inbound flight, adjust the pickup as it moves, and meet you inside arrivals — so a delay is our problem, not yours.",
    points: [
      ["Flight tracked in real time", "We watch the inbound flight and move the pickup with it. If you land early or late, the car moves too."],
      ["Meet and greet in arrivals", "Your chauffeur waits inside the terminal with a name board, and handles the luggage from the door to the boot."],
      ["Fixed fare, agreed up front", "No meter, no surge, no waiting charge for the first hour after landing."],
      ["Every Dublin terminal", "T1 and T2, arrivals and departures, and onward runs to anywhere in Ireland."],
    ],
    faq: [
      ["What happens if my flight is delayed?", "We track your flight in real time and adjust the pick-up time accordingly, ensuring that your chauffeur is ready and waiting when you arrive, even if your flight is delayed."],
      ["Where will my chauffeur meet me?", "Inside the arrivals hall with a name board, unless you would rather be collected kerbside. Tell us which you prefer when you book."],
    ],
  },
  {
    slug: "corporate-travel",
    vehicle: "E-Class for day-to-day running. S-Class when the person in the back is the reason the meeting exists.",
    nav: "Corporate travel",
    title: "Corporate chauffeur services in Dublin",
    kicker: "Corporate",
    blurb: "Accounts, repeat bookings and a consistent chauffeur for clients and executives arriving in Dublin.",
    img: "corporate-office",
    heroImg: "fleet-rear",
    imgRatio: "portrait",
    alt: "A chauffeur greeting a business client outside a Dublin office building, black Mercedes-Benz E-Class in the foreground",
    lede: "When a client is in from London or New York for the day, the car is the first and last thing they experience of your company. We run it as an extension of your front desk.",
    points: [
      ["One account, one invoice", "Book across a team and settle monthly rather than trip by trip."],
      ["The same chauffeur where it matters", "For recurring routes and repeat clients, continuity beats novelty."],
      ["Discretion as standard", "Calls get taken. Conversations stay in the car."],
      ["Work while you move", "Wi-Fi on board, so a 40-minute run from the airport is 40 minutes of work."],
    ],
    faq: [
      ["Can you invoice our company directly?", "Yes. We can set up an account and invoice monthly rather than per journey."],
      ["Can you handle several arrivals on the same day?", "Yes — tell us the flights and we will schedule the cars around them."],
    ],
  },
  {
    slug: "business-travel",
    vehicle: "E-Class for one or two people. Sprinter for a roadshow team moving between sites, so nobody splits across taxis.",
    nav: "Business travel",
    title: "Business travel chauffeur in Ireland",
    kicker: "Business",
    blurb: "Meetings, conferences and site visits across Ireland, with the car waiting between stops.",
    img: "business-quays",
    imgRatio: "wide",
    alt: "Black Mercedes-Benz E-Class on the Dublin quays with the Convention Centre Dublin behind",
    lede: "Three meetings in two cities is a scheduling problem before it is a driving problem. Give us the day and we will build the route around it, including the waiting.",
    points: [
      ["Half-day and full-day hire", "The car and chauffeur stay with you between appointments instead of being re-booked each leg."],
      ["Anywhere in Ireland", "Dublin to Belfast, Cork, Galway or Limerick, and back the same day if the schedule needs it."],
      ["Routes planned around the diary", "Send the appointments; we will work out the departures."],
      ["Quiet, clean, and on time", "A car you can take a call in, arriving before you need it."],
    ],
    faq: [
      ["Can the car wait between meetings?", "Yes. Half-day and full-day hire keeps the same car and chauffeur with you for the whole schedule."],
      ["Do you travel outside Dublin?", "We offer chauffeur services throughout Dublin and across Ireland, including airport transfers, corporate travel, and private tours to various destinations."],
    ],
  },
  {
    slug: "weddings",
    vehicle: "S-Class for the couple. A Sprinter alongside it if the wedding party needs moving between the ceremony and the reception.",
    nav: "Weddings",
    title: "Wedding chauffeur services in Dublin",
    kicker: "Weddings",
    blurb: "Ceremony, photographs and reception, with one chauffeur holding the timings together.",
    img: "wedding-georgian",
    imgRatio: "wide",
    alt: "A chauffeur holding an umbrella over a client beside a black Mercedes-Benz E-Class on a Georgian Dublin street",
    lede: "On the day, the car is a moving green room. Ours arrives early, stays for as long as the schedule needs, and takes the small problems off the couple entirely — including the Irish weather.",
    points: [
      ["We arrive before you need us", "Early enough that nobody is watching the road."],
      ["The whole day, not a single leg", "Ceremony, photographs, reception — the car stays with the schedule."],
      ["Dressed for the occasion", "Ribbons and interior finish arranged in advance to suit the colours."],
      ["An umbrella at every door", "It is Ireland. This is not an optional extra."],
    ],
    faq: [
      ["Can we see the car before the day?", "Yes — we can arrange a viewing so there are no surprises."],
      ["Can I customise the booking?", "Yes, all of our services, including private tours and corporate travel, are fully customizable to suit your preferences, schedule, and specific needs."],
    ],
  },
  {
    slug: "events",
    vehicle: "S-Class for an arrival that gets photographed. Sprinter for a group that wants to leave together.",
    nav: "Events",
    title: "Event chauffeur services in Dublin",
    kicker: "Events",
    blurb: "Galas, race days, concerts and private celebrations, with a car that is there when you step out.",
    img: "events-glass",
    imgRatio: "wide",
    alt: "Black Mercedes-Benz E-Class parked outside a modern glass building in Dublin at dusk",
    lede: "The worst part of a good night out is the twenty minutes at the end of it. We hold the car nearby, so leaving takes as long as walking to the kerb.",
    points: [
      ["Collected on your word", "Message when you are ready; the car is at the door, not circling."],
      ["Groups across several cars", "Tell us the headcount and we will co-ordinate arrivals so nobody is left waiting."],
      ["Late finishes covered", "Agreed in advance, so there is no negotiation at one in the morning."],
      ["Arrivals that look right", "Dropped at the entrance, not at the end of the road."],
    ],
    faq: [
      ["Can you collect a group?", "Yes — we can co-ordinate several cars so a group arrives and leaves together."],
      ["How late can you run?", "Late finishes are arranged when you book, so the return leg is agreed in advance."],
    ],
  },
];

/* ---------------------------------------------------------------- fleet ---
   Three vehicles. Two are his; the Sprinter and anything larger comes from
   vetted partner chauffeurs, and the copy says so rather than implying a
   fleet that does not exist.

   There are no photographs of the S-Class or the Sprinter, so each vehicle is
   drawn as gold line-art — the same language as the logo, and it lets them
   animate. Silhouettes are schematic, not scale drawings.                    */

const CAR_ART = {
  "e-class": `
    <svg viewBox="0 0 420 158" role="img" aria-label="Line drawing of a Mercedes-Benz E-Class saloon in side profile">
      <path class="ground" d="M8 143 H412"/>
      <path class="body" d="M20.0 103.9 L30.1 103.9 L32.3 70.9 L37.1 66.6 L48.8 62.9 L65.8 59.2 L147.4 49.6 L176.2 33.6 L196.9 23.5 L208.7 19.7 L227.3 17.1 L266.2 16.0 L285.9 17.1 L300.9 19.7 L315.3 24.5 L324.9 28.8 L351.5 43.2 L374.4 48.5 L388.8 50.1 L390.4 52.2 L392.5 58.6 L393.1 69.3 L397.9 69.8 L400.0 73.0 L400.0 97.0 L363.7 97.0 L363.7 97.0 L362.9 97.0 L360.6 97.0 L356.9 92.1 L352.0 86.6 L346.0 82.2 L339.3 79.2 L332.0 77.7 L324.6 77.7 L317.4 79.2 L310.6 82.2 L304.6 86.6 L299.7 92.1 L296.0 97.0 L293.7 97.0 L292.9 97.0 L292.9 97.0 L128.9 97.0 L128.9 97.0 L128.2 97.0 L125.9 97.0 L122.2 92.1 L117.2 86.6 L111.2 82.2 L104.5 79.2 L97.2 77.7 L89.8 77.7 L82.6 79.2 L75.9 82.2 L69.9 86.6 L64.9 92.1 L61.2 97.0 L58.9 97.0 L58.2 97.0 L58.2 97.0 L20.0 97.0 Z"/>
      <path class="glass" d="M147.4 49.6 L176.2 33.6 L196.9 23.5 L208.7 19.7 L227.3 17.1 L266.2 16.0 L285.9 17.1 L300.9 19.7 L315.3 24.5 L324.9 28.8 L351.5 43.2 L374.4 48.5 L388.8 50.1 L390.4 52.2 L390.4 54.7 L147.4 54.7 Z"/>
      <circle class="tyre" cx="93.5" cy="112.9" r="30.5"/><circle class="tyre" cx="328.3" cy="112.9" r="30.5"/>
      <circle class="hub" cx="93.5" cy="112.9" r="13.4"/><circle class="hub" cx="328.3" cy="112.9" r="13.4"/>
    </svg>`,
  "s-class": `
    <svg viewBox="0 0 420 156" role="img" aria-label="Line drawing of a Mercedes-Benz S-Class saloon in side profile">
      <path class="ground" d="M8 142 H412"/>
      <path class="body" d="M20.0 103.9 L30.1 103.9 L32.3 70.9 L37.1 66.6 L48.8 62.9 L65.8 59.2 L147.4 49.6 L176.2 33.6 L196.9 23.5 L208.7 19.7 L227.3 17.1 L266.2 16.0 L285.9 17.1 L300.9 19.7 L315.3 24.5 L324.9 28.8 L351.5 43.2 L374.4 48.5 L388.8 50.1 L390.4 52.2 L392.5 58.6 L393.1 69.3 L397.9 69.8 L400.0 73.0 L400.0 97.0 L363.7 97.0 L363.7 97.0 L362.9 97.0 L360.6 97.0 L356.9 92.1 L352.0 86.6 L346.0 82.2 L339.3 79.2 L332.0 77.7 L324.6 77.7 L317.4 79.2 L310.6 82.2 L304.6 86.6 L299.7 92.1 L296.0 97.0 L293.7 97.0 L292.9 97.0 L292.9 97.0 L128.9 97.0 L128.9 97.0 L128.2 97.0 L125.9 97.0 L122.2 92.1 L117.2 86.6 L111.2 82.2 L104.5 79.2 L97.2 77.7 L89.8 77.7 L82.6 79.2 L75.9 82.2 L69.9 86.6 L64.9 92.1 L61.2 97.0 L58.9 97.0 L58.2 97.0 L58.2 97.0 L20.0 97.0 Z"/>
      <path class="glass" d="M147.4 49.6 L176.2 33.6 L196.9 23.5 L208.7 19.7 L227.3 17.1 L266.2 16.0 L285.9 17.1 L300.9 19.7 L315.3 24.5 L324.9 28.8 L351.5 43.2 L374.4 48.5 L388.8 50.1 L390.4 52.2 L390.4 54.7 L147.4 54.7 Z"/>
      <circle class="tyre" cx="93.5" cy="112.9" r="29.1"/><circle class="tyre" cx="328.3" cy="112.9" r="29.1"/>
      <circle class="hub" cx="93.5" cy="112.9" r="12.8"/><circle class="hub" cx="328.3" cy="112.9" r="12.8"/>
    </svg>`,
  "sprinter": `
    <svg viewBox="0 0 420 181" role="img" aria-label="Line drawing of a Mercedes-Benz Sprinter van in side profile">
      <path class="ground" d="M8 167 H412"/>
      <path class="body" d="M20.0 102.0 L25.7 100.3 L38.8 92.9 L53.0 86.6 L59.3 86.1 L66.1 78.7 L68.4 78.7 L74.1 73.0 L74.7 69.0 L110.0 34.2 L123.7 25.1 L138.5 19.4 L161.9 17.7 L206.3 16.6 L328.8 16.0 L382.3 17.1 L386.9 18.8 L389.7 22.3 L400.0 54.7 L400.0 134.1 L336.1 134.1 L336.1 134.1 L335.5 134.1 L333.9 134.1 L331.3 130.7 L327.8 126.8 L323.6 123.7 L318.8 121.6 L313.7 120.5 L308.5 120.5 L303.4 121.6 L298.6 123.7 L294.4 126.8 L290.9 130.7 L288.3 134.1 L286.7 134.1 L286.2 134.1 L286.2 134.1 L91.7 134.1 L91.7 134.1 L91.1 134.1 L89.5 134.1 L86.9 130.7 L83.4 126.8 L79.2 123.7 L74.4 121.6 L69.3 120.5 L64.1 120.5 L59.0 121.6 L54.2 123.7 L50.0 126.8 L46.5 130.7 L43.9 134.1 L42.3 134.1 L41.8 134.1 L41.8 134.1 L20.0 134.1 Z"/>
      <path class="glass" d="M110.0 34.2 L123.7 25.1 L138.5 19.4 L161.9 17.7 L206.3 16.6 L328.8 16.0 L382.3 17.1 L386.9 18.8 L389.7 22.3 L400.0 54.7 L400.0 63.2 L110.0 63.2 Z"/>
      <circle class="tyre" cx="66.7" cy="145.3" r="21.5"/><circle class="tyre" cx="311.1" cy="145.3" r="21.5"/>
      <circle class="hub" cx="66.7" cy="145.3" r="9.5"/><circle class="hub" cx="311.1" cy="145.3" r="9.5"/>
    </svg>`,
};

const VEHICLES = [
  {
    key: "e-class",
    name: "Mercedes-Benz E-Class",
    sub: "The default",
    lede:
      "The saloon most executive travel actually happens in, and for good reasons: it is quiet at motorway speed, the rear seats are genuinely comfortable over an hour, and it does not announce itself. This is the car that arrives unless you ask for something else.",
    specs: [
      ["Model", "E220d, AMG Line"],
      ["Passengers", "Up to 3"],
      ["Luggage", todo("Confirm capacity")],
      ["On board", "Wi-Fi, chilled water"],
    ],
    tags: ["Airport transfers", "Corporate", "Business travel"],
    availTitle: "Ours",
    avail:
      "Owned and driven by us. Cleaned before every journey rather than on a weekly schedule.",
  },
  {
    key: "s-class",
    name: "Mercedes-Benz S-Class",
    sub: "The step up",
    lede:
      "More rear legroom, a quieter cabin and a noticeably more formal arrival. Worth booking when the journey is part of the impression — a first meeting, a board visit, a wedding, or a client you would rather not put in anything ordinary.",
    specs: [
      ["Model", "S-Class saloon"],
      ["Passengers", "Up to 3"],
      ["Luggage", todo("Confirm capacity")],
      ["On board", "Wi-Fi, chilled water"],
    ],
    tags: ["VIP arrivals", "Weddings", "Executive"],
    availTitle: "Ours",
    avail:
      "Also owned and driven by us. Ask for it when you book — it is not the default, so it has to be requested.",
  },
  {
    key: "sprinter",
    name: "Mercedes-Benz Sprinter",
    sub: "Groups and luggage",
    lede:
      "When the group is bigger than a saloon, or the luggage is — golf bags, ski gear, camera kit, a roadshow team moving between four meetings in a day. One vehicle, one chauffeur, everybody arriving together instead of in a convoy of taxis.",
    specs: [
      ["Model", "Sprinter, configuration varies"],
      ["Passengers", todo("Confirm seats")],
      ["Luggage", todo("Confirm capacity")],
      ["On board", todo("Confirm amenities")],
    ],
    tags: ["Groups", "Bulky luggage", "Roadshows", "Airport runs"],
    availTitle: "Partner chauffeur",
    avail:
      "Arranged through chauffeurs we work with and vouch for, not a broker. You still book through us, you still get one fixed fare up front, and we stay responsible for the job.",
  },
];

function fleetBlock(id) {
  const tabs = VEHICLES.map(
    (v, i) =>
      `<button class="fleet__tab" type="button" role="tab" id="${id}-t-${v.key}"
              aria-controls="${id}-p-${v.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"
              data-v="${v.key}">
        <span class="fleet__tab-n">${v.name.replace("Mercedes-Benz ", "")}</span>
        <span class="fleet__tab-s">${v.sub}</span>
      </button>`
  ).join("\n        ");

  /* One SVG that morphs, not three that swap. The markup carries the E-Class
     drawn statically, so the component is right before — and without — JS. */
  const art = `<div class="fleet__art is-on">${MORPH_STATIC}</div>
        <script type="application/json" class="fleet__data">${JSON.stringify(MORPH)}</script>`;

  const panels = VEHICLES.map(
    (v, i) => `<div data-vehicle-panel="${v.key}" id="${id}-p-${v.key}" role="tabpanel"
             aria-labelledby="${id}-t-${v.key}"${i === 0 ? "" : " hidden"} class="stack">
          <p class="fleet__lede"><b>${v.name}.</b> ${esc(v.lede)}</p>
          <dl class="fleet__specs">
            ${v.specs
              .map(([k, val]) => `<div class="fleet__spec"><dt>${k}</dt><dd>${val}</dd></div>`)
              .join("\n            ")}
          </dl>
          <div class="fleet__tags">${v.tags.map((t) => `<span class="fleet__tag">${t}</span>`).join("")}</div>
          <p class="fleet__avail"><span><b>${v.availTitle}.</b> ${esc(v.avail)}</span></p>
        </div>`
  ).join("\n        ");

  return `<div class="fleet" data-fleet>
      <div class="fleet__tabs" role="tablist" aria-label="Choose a vehicle">
        ${tabs}
      </div>
      <div class="fleet__stage">
        ${art}
        <span class="fleet__sheen" aria-hidden="true"></span>
      </div>
      <div class="fleet__panel">
        ${panels}
      </div>
    </div>`;
}

const STEPS = [
  ["Send the journey", "Pickup, drop-off, date and time — plus the flight number if you are landing. Two minutes on the form, or one phone call."],
  ["Get a fixed fare", "A single number back the same day, covering the vehicle, the chauffeur, tolls and the first hour of airport waiting. No meter, no surge."],
  ["Confirm it", "We come back to agree the details — terminal, name board, child seat, the wedding running order — and the booking is set."],
  ["We are already there", "Your chauffeur arrives before the pickup time. If you are flying, the pickup has already moved with your flight."],
];

const AREAS = [
  ["Dublin Airport", "Terminal 1 and Terminal 2, arrivals and departures, meet-and-greet or kerbside."],
  ["Dublin city", "City centre, the Docklands and the IFSC, Ballsbridge and Dublin 4, Temple Bar and the Georgian core."],
  ["County Dublin", "Dún Laoghaire, Blackrock, Sandyford, Malahide, Howth, Swords, Blanchardstown and the rest of the county."],
  ["Leinster", "Kildare, Meath, Wicklow and Louth — Punchestown, the K Club, Carton House, Powerscourt and the Wicklow houses."],
  ["Nationwide", "Cork, Galway, Limerick, Belfast and anywhere else in Ireland, as a one-way run or a return the same day."],
  ["Ports and rail", "Dublin Port, Rosslare, Heuston and Connolly — the same fixed-fare treatment as the airport."],
];

const FAQ_HOME = [
  ["What areas do Jet Executive Travel cover?", "We offer chauffeur services throughout Dublin and across Ireland, including airport transfers, corporate travel, and private tours to various destinations."],
  ["What happens if my flight is delayed?", "We track your flight in real time and adjust the pick-up time accordingly, ensuring that your chauffeur is ready and waiting when you arrive, even if your flight is delayed."],
  ["How do I book a chauffeur service?", "Send the journey through the booking form on this site, or call us directly. We confirm every booking by phone or email before the day."],
  ["Can I customise my tour or transportation service?", "Yes, all of our services, including private tours and corporate travel, are fully customizable to suit your preferences, schedule, and specific needs."],
  ["Is the fare fixed before I travel?", "Yes. We quote the journey up front and that is the fare — there is no meter in the car."],
];

/* ------------------------------------------------------------------ utils */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const img = (name, { widths, sizes, alt, cls = "", ratio = "", loading = "lazy", fetchpriority = "" }) => {
  const srcset = widths.map((w) => `assets/img/${name}-${w}.webp ${w}w`).join(", ");
  return `<img src="assets/img/${name}-${widths[widths.length - 1]}.webp" srcset="${srcset}" sizes="${sizes}"${
    ratio ? ` width="${ratio[0]}" height="${ratio[1]}"` : ""
  } alt="${esc(alt)}"${cls ? ` class="${cls}"` : ""} loading="${loading}" decoding="async"${
    fetchpriority ? ` fetchpriority="${fetchpriority}"` : ""
  }>`;
};

const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1.5 7.5 5 11l7.5-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_ARROW = `<svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true"><path d="M0 5h12M8.5 1 12.5 5l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_STAR = `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2Z"/></svg>`;

/* ----------------------------------------------------------------- shell */
function header(active) {
  const svc = SERVICES.map(
    (s) => `<a href="${s.slug}.html"${active === s.slug ? ' aria-current="page"' : ""}>${s.nav}<span class="sub">${esc(s.blurb.split(",")[0])}</span></a>`
  ).join("\n            ");
  const drawerSvc = SERVICES.map((s) => `<a class="drawer__sub" href="${s.slug}.html">${s.nav}</a>`).join("\n      ");
  return `<a class="skip" href="#main">Skip to content</a>
<header class="hdr">
  <div class="wrap hdr__in">
    <a class="hdr__logo" href="index.html" aria-label="${BIZ.name} — home">
      <img src="assets/img/logo-480.png" width="158" height="112" alt="${BIZ.name}">
    </a>
    <div class="hdr__spacer"></div>
    <nav class="nav" aria-label="Main">
      <a class="nav__a" href="index.html"${active === "home" ? ' aria-current="page"' : ""}>Home</a>
      <div class="nav__group">
        <a class="nav__a" href="services.html"${active === "services" ? ' aria-current="page"' : ""}>Services</a>
        <div class="nav__panel">
            ${svc}
        </div>
      </div>
      <a class="nav__a" href="fleet.html"${active === "fleet" ? ' aria-current="page"' : ""}>Fleet</a>
      <a class="nav__a" href="about.html"${active === "about" ? ' aria-current="page"' : ""}>About</a>
      <a class="nav__a" href="index.html#reviews">Reviews</a>
      <a class="nav__a" href="contact.html"${active === "contact" ? ' aria-current="page"' : ""}>Contact</a>
    </nav>
    <a class="hdr__tel" href="tel:${BIZ.telHref}">${BIZ.tel}</a>
    <a class="btn btn--primary btn--sm hdr__cta" href="contact.html">Book now</a>
    <button class="burger" type="button" aria-expanded="false" aria-controls="drawer" aria-label="Menu"><span></span></button>
  </div>
</header>
<div class="drawer" id="drawer" aria-hidden="true">
      <a href="index.html">Home</a>
      <a href="services.html">Services</a>
      ${drawerSvc}
      <a href="fleet.html">Fleet</a>
      <a href="about.html">About</a>
      <a href="index.html#reviews">Reviews</a>
      <a href="contact.html">Contact</a>
  <div class="drawer__foot">
    <a class="btn btn--primary" href="contact.html">Book a journey</a>
    <a class="btn btn--ghost" href="tel:${BIZ.telHref}">Call ${BIZ.tel}</a>
  </div>
</div>`;
}

function footer() {
  const svc = SERVICES.map((s) => `<li><a href="${s.slug}.html">${s.nav}</a></li>`).join("\n        ");
  return `<footer class="ftr">
  <div class="wrap">
    <div class="ftr__grid">
      <div>
        <div class="ftr__logo"><img src="assets/img/logo-480.png" width="172" height="122" alt="${BIZ.name}"></div>
        <address>
          ${BIZ.street}<br>${BIZ.area}, ${BIZ.city}, ${BIZ.postal}<br>
          <a href="tel:${BIZ.telHref}">${BIZ.tel}</a><br>
          <a href="tel:${BIZ.tel2Href}">${BIZ.tel2}</a><br>
          <a href="mailto:${BIZ.email}">${BIZ.email}</a>
        </address>
        <div class="ftr__social">
          <a href="${BIZ.facebook}" rel="noopener" aria-label="${BIZ.name} on Facebook"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1Z"/></svg></a>
          <a href="${BIZ.linkedin}" rel="noopener" aria-label="${BIZ.name} on LinkedIn"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.9 8H4v12h2.9V8Zm.2-3.4A1.7 1.7 0 1 0 5.4 6.3 1.7 1.7 0 0 0 7.1 4.6ZM20 13.4c0-3.2-1.7-4.7-4-4.7a3.5 3.5 0 0 0-3.1 1.7V8H10v12h2.9v-6.3c0-1.7 1.1-2.3 2.1-2.3s2 .7 2 2.2V20H20Z"/></svg></a>
        </div>
      </div>
      <div>
        <h2>Services</h2>
        <ul>
        ${svc}
        </ul>
      </div>
      <div>
        <h2>Company</h2>
        <ul>
          <li><a href="fleet.html">The fleet</a></li>
          <li><a href="about.html">About us</a></li>
          <li><a href="index.html#fares">Fares</a></li>
          <li><a href="index.html#reviews">Reviews</a></li>
          <li><a href="contact.html">Book a journey</a></li>
          <li><a href="privacy.html">Privacy &amp; cookies</a></li>
        </ul>
      </div>
    </div>
    <div class="ftr__base">
      <span>&copy; <span data-year>2026</span> ${BIZ.name}. Chauffeur services in Dublin and across Ireland.</span>
      <span>Hours: ${todo("Confirm hours")}</span>
    </div>
  </div>
</footer>

<div class="rail" aria-hidden="false">
  <a class="btn btn--ghost" href="tel:${BIZ.telHref}">Call</a>
  <a class="btn btn--primary" href="contact.html">Book a journey</a>
</div>

<aside class="consent" role="dialog" aria-label="Cookies" aria-live="polite">
  <h2>Before we measure anything</h2>
  <p>We use analytics cookies only to see which pages people find useful. Nothing loads until you choose, and declining changes nothing about the site.</p>
  <div class="consent__btns">
    <button class="btn btn--primary btn--sm" type="button" data-consent="yes">Accept</button>
    <button class="btn btn--ghost btn--sm" type="button" data-consent="no">Decline</button>
  </div>
</aside>

<script src="assets/js/site.js" defer></script>`;
}

function shell({ slug, title, desc, active, body, schema = [], ogImg = "hero-aviva-1280.webp" }) {
  const canonical = `${SITE}/${slug === "index" ? "" : slug + ".html"}`;
  const ld = schema.length
    ? `\n<script type="application/ld+json">${JSON.stringify(schema.length === 1 ? schema[0] : schema)}</script>`
    : "";
  return `<!doctype html>
<html lang="en-IE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_IE">
<meta property="og:site_name" content="${BIZ.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/assets/img/${ogImg}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B0B0D">
<link rel="icon" href="assets/img/logo-240.png">
<link rel="apple-touch-icon" href="assets/img/logo-240.png">
<link rel="preload" href="assets/fonts/bodonimoda-normal-400-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/archivo-normal-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<script>document.documentElement.className+=" js";</script>
<link rel="stylesheet" href="assets/css/site.css">${ld}
</head>
<body>
${header(active)}
<main id="main">
${body}
</main>
${footer()}
</body>
</html>`;
}

/* --------------------------------------------------------------- sections */
const sectionHead = (eyebrow, title, desc, center = false) => `
    <div class="shead${center ? " shead--center" : ""} rv">
      <span class="eyebrow">${eyebrow}</span>
      <h2 class="d2 shead__t leaf">${title}</h2>
      ${desc ? `<p class="lede shead__d">${desc}</p>` : ""}
    </div>`;

const faqBlock = (items) => `
    <div class="faq">
      ${items
        .map(
          ([q, a]) => `<details class="rv">
        <summary>${esc(q)}</summary>
        <div class="faq__a">${esc(a)}</div>
      </details>`
        )
        .join("\n      ")}
    </div>`;

const faqSchema = (items) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});

const localBusiness = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": SITE + "/#business",
  name: BIZ.name,
  slogan: BIZ.tagline,
  url: SITE + "/",
  telephone: BIZ.tel,
  email: BIZ.email,
  image: SITE + "/assets/img/hero-aviva-1280.webp",
  logo: SITE + "/assets/img/logo-480.png",
  address: {
    "@type": "PostalAddress",
    streetAddress: BIZ.street,
    addressLocality: BIZ.city,
    postalCode: BIZ.postal,
    addressCountry: BIZ.country,
  },
  areaServed: [
    { "@type": "City", name: "Dublin" },
    { "@type": "Country", name: "Ireland" },
  ],
  sameAs: [BIZ.facebook, BIZ.linkedin],
  // TODO before launch: add aggregateRating once the real ratingValue is
  // confirmed from the Google Business Profile. Do NOT guess the number —
  // an invented ratingValue is schema spam and risks a manual action.
  // "aggregateRating": { "@type":"AggregateRating", "ratingValue":"<REAL VALUE>", "reviewCount":"117" },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Chauffeur services",
    itemListElement: SERVICES.map((s) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: s.title, url: `${SITE}/${s.slug}.html` },
    })),
  },
};

/* ------------------------------------------------------------------ pages */
const pages = [];

/* ---------- HOME ---------- */
{
  const stops = SERVICES.map(
    (s, i) => `
        <a class="card rv${i % 2 ? " rv-d1" : ""}" href="${s.slug}.html">
          <span class="spine__stop" style="top:${i * 20}%" aria-hidden="true"></span>
          <div class="card__media">
            ${img(s.img, {
              widths: s.imgRatio === "portrait" ? [700, 1000] : [600, 900],
              sizes: "(min-width:820px) 46vw, 92vw",
              alt: s.alt,
            })}
          </div>
          <div class="card__body">
            <span class="card__k">${String(i + 1).padStart(2, "0")} &middot; ${s.kicker}</span>
            <h3 class="card__t">${s.title.replace(/ in Dublin.*$/, "").replace(/, Dublin and nationwide$/, "")}</h3>
            <p class="card__d">${esc(s.blurb)}</p>
            <span class="card__more">Read more about ${s.nav.toLowerCase()} ${ICON_ARROW}</span>
          </div>
        </a>`
  ).join("");

  const body = `
<section class="hero">
  <div class="hero__media">
    <img class="hero__base" src="assets/img/hero-aviva-1920.webp"
         srcset="assets/img/hero-aviva-800.webp 800w, assets/img/hero-aviva-1280.webp 1280w, assets/img/hero-aviva-1920.webp 1920w"
         sizes="100vw" alt="" aria-hidden="true" fetchpriority="high" decoding="async">
    <img class="hero__lit" src="assets/img/hero-aviva-1920.webp"
         srcset="assets/img/hero-aviva-800.webp 800w, assets/img/hero-aviva-1280.webp 1280w, assets/img/hero-aviva-1920.webp 1920w"
         sizes="100vw"
         alt="A chauffeur in a dark suit standing beside a black Mercedes-Benz E-Class outside the Aviva Stadium in Dublin"
         fetchpriority="high" decoding="async">
  </div>
  <div class="hero__scrim" aria-hidden="true"></div>
  <div class="hero__in">
    <div class="wrap">
      <h1 class="d1 hero__title">Chauffeur service <span class="l2 leaf">in Dublin</span></h1>
      <p class="lede hero__sub">Flight-tracked airport transfers, corporate travel and wedding cars in a black Mercedes-Benz E-Class. Fixed fares, quoted before you book.</p>
      <div class="btn-row hero__cta">
        <a class="btn btn--primary" href="contact.html" data-magnetic>Book a journey</a>
        <a class="btn btn--ghost" href="#fares">See fares</a>
      </div>
      <p class="hero__trust">
        <span>${ICON_STAR} <b class="num">${BIZ.reviews}</b> Google reviews</span>
        <span>${ICON_CHECK} Flights tracked in real time</span>
        <span>${ICON_CHECK} Fixed fare, no meter</span>
      </p>
    </div>
  </div>
</section>

<section class="stats" aria-label="At a glance">
  <div class="stat"><span class="stat__v num" data-count="${BIZ.reviews}">0</span><span class="stat__l">Google reviews</span></div>
  <div class="stat"><span class="stat__v">1</span><span class="stat__l">Mercedes-Benz E-Class</span></div>
  <div class="stat"><span class="stat__v">32</span><span class="stat__l">Counties covered</span></div>
  <div class="stat"><span class="stat__v num" data-count="60" data-suffix=" min">0</span><span class="stat__l">Free airport wait</span></div>
</section>

<section class="section" id="fares">
  <div class="wrap">
    ${sectionHead("Fares", "The price is the price", "Most chauffeur companies in Dublin make you ring for a quote. Here are the common runs, fixed, with nothing added at the end.")}
    <div class="fares rv">
      <table>
        <caption class="visually-hidden">Fixed fares for common Dublin chauffeur journeys</caption>
        <thead><tr><th scope="col">Journey</th><th scope="col">Typical time</th><th scope="col">Fixed fare</th></tr></thead>
        <tbody>
          <tr><td>Dublin Airport &rarr; city centre</td><td>25&ndash;40 min</td><td class="price">${todo("Set fare")}</td></tr>
          <tr><td>Dublin Airport &rarr; Dublin 4 / Ballsbridge</td><td>30&ndash;45 min</td><td class="price">${todo("Set fare")}</td></tr>
          <tr><td>Dublin Airport &rarr; south county Dublin</td><td>45&ndash;60 min</td><td class="price">${todo("Set fare")}</td></tr>
          <tr><td>City centre &rarr; Dublin Airport</td><td>25&ndash;40 min</td><td class="price">${todo("Set fare")}</td></tr>
          <tr><td>Half-day hire (4 hours)</td><td>As directed</td><td class="price">${todo("Set fare")}</td></tr>
          <tr><td>Full-day hire (8 hours)</td><td>As directed</td><td class="price">${todo("Set fare")}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="small dimmer rv" style="margin-top:1.25rem;max-width:62ch">Fares include the vehicle, chauffeur, tolls and one hour of airport waiting time. Journeys outside Dublin are quoted per route &mdash; <a href="contact.html">send us the details</a> and you will have a number back the same day.</p>
  </div>
</section>

<section class="section section--line" id="services">
  <div class="wrap">
    ${sectionHead("Services", "One car, five kinds of day", "Every journey ends up being one of these. Pick the closest and we will shape it around your schedule.")}
    <div class="spine">
      <div class="spine__rail" aria-hidden="true"><div class="spine__fill"></div></div>
      <div class="svcs">${stops}
      </div>
    </div>
  </div>
</section>

<section class="section section--line" id="the-car">
  <div class="wrap">
    ${sectionHead("The fleet", "Two cars of our own, and a van when a saloon will not do", "Most journeys go in the E-Class. The S-Class is there when the arrival matters more than usual. Anything bigger, we arrange through chauffeurs we work with and stand over.")}
    ${fleetBlock("home")}
    <p class="small dimmer rv" style="margin-top:1.25rem;max-width:64ch">Need something not listed &mdash; a second car running in convoy, a people carrier, a child seat fitted before pickup? <a href="contact.html">Tell us what the day looks like</a> and we will put the right vehicle against it.</p>
  </div>
</section>

<section class="section section--line">
  <div class="wrap">
    <div class="split split--flip">
      <div class="split__media rv">
        ${img("hero-portrait", {
          widths: [700, 1000],
          sizes: "(min-width:900px) 46vw, 92vw",
          alt: "A chauffeur holding an umbrella over a client stepping out of a black Mercedes-Benz E-Class outside a Georgian Dublin doorway",
        })}
      </div>
      <div class="stack rv rv-d1">
        <span class="eyebrow">The standard</span>
        <h2 class="d2 leaf">The same car you were shown, on the day you booked it</h2>
        <p class="lede">A chauffeur company is only ever as good as the least interesting part of the job: whether the car is clean, whether it is early, and whether anybody has to be chased.</p>
        <ul class="checks" style="margin-top:.75rem">
          <li>${ICON_CHECK}<span><b>Valeted before your journey.</b> Not on a weekly rota that happens to fall near it &mdash; inside and out, before you get in.</span></li>
          <li>${ICON_CHECK}<span><b>Early, as a habit.</b> The chauffeur is at the pickup before the pickup time. You should never be the one waiting.</span></li>
          <li>${ICON_CHECK}<span><b>Quiet unless you want otherwise.</b> Some people want to talk about the match. Some want to take a call from Frankfurt. Your chauffeur reads which one you are.</span></li>
          <li>${ICON_CHECK}<span><b>An umbrella at every door.</b> This is Dublin. It is equipment, not a flourish.</span></li>
        </ul>
        <div class="btn-row" style="margin-top:.5rem"><a class="btn btn--ghost" href="fleet.html">See the full fleet ${ICON_ARROW}</a></div>
      </div>
    </div>
  </div>
</section>

<section class="section section--line" id="how">
  <div class="wrap">
    ${sectionHead("How it works", "Four steps, and three of them are ours", "There is no app to download and no account to create. You tell us the journey; we do the rest.")}
    <div class="steps rv">
      ${STEPS.map(([t, d], i) => `<div class="step">
        <span class="step__n num">${String(i + 1).padStart(2, "0")}</span>
        <h3 class="step__t">${t}</h3>
        <p class="step__d">${esc(d)}</p>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section section--line" id="areas">
  <div class="wrap">
    ${sectionHead("Where we go", "Dublin properly, and the rest of Ireland when you need it", "Most work is the airport and the city. None of it stops at the M50.")}
    <div class="areas rv">
      ${AREAS.map(([t, d]) => `<div class="area">
        <h3 class="area__t">${t}</h3>
        <p class="area__l">${esc(d)}</p>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section section--line" id="reviews">
  <div class="wrap">
    ${sectionHead("Reviews", "What ${BIZ.reviews} people said".replace("${BIZ.reviews}", BIZ.reviews), "Every one of these is a verified Google review. We do not write them, edit them, or pick the good ones.")}
    <div class="rev">
      <div class="rev__score rv">
        <span class="rev__n num">${BIZ.reviews}</span>
        <span class="rev__l">Google reviews</span>
        <div class="rev__stars" aria-hidden="true">${ICON_STAR}${ICON_STAR}${ICON_STAR}${ICON_STAR}${ICON_STAR}</div>
        <span class="rev__l" style="margin-top:.5rem">Average ${todo("Confirm rating")}</span>
      </div>
      <div class="rev__slot rv rv-d1">
        <p class="small dim" style="max-width:52ch;margin-inline:auto">
          <strong style="color:var(--paper)">Review widget goes here.</strong> Drop the existing Trustindex embed into this block,
          or link the Google Business Profile directly. It is deliberately loaded after the page renders so it costs nothing on first paint.
        </p>
      </div>
    </div>
  </div>
</section>

<section class="section section--line">
  <div class="wrap wrap--narrow">
    ${sectionHead("Questions", "Answered before you ask", "", true)}
    ${faqBlock(FAQ_HOME)}
  </div>
</section>

<section class="section section--line" id="book">
  <div class="wrap">
    <div class="shead shead--center rv">
      <span class="eyebrow">Book</span>
      <h2 class="d2 shead__t leaf">Tell us where and when</h2>
      <p class="lede shead__d">Send the journey and you will have a fixed fare back the same day. If it is for today, call &mdash; that is always faster.</p>
      <div class="btn-row" style="justify-content:center;margin-top:1rem">
        <a class="btn btn--primary" href="contact.html">Book a journey</a>
        <a class="btn btn--ghost" href="tel:${BIZ.telHref}">${BIZ.tel}</a>
      </div>
    </div>
  </div>
</section>`;

  pages.push({
    slug: "index",
    title: `Chauffeur Service in Dublin | ${BIZ.name}`,
    desc: "Flight-tracked airport transfers, corporate travel and wedding cars in a black Mercedes-Benz E-Class. Fixed fares across Dublin and Ireland.",
    active: "home",
    body,
    schema: [localBusiness, faqSchema(FAQ_HOME)],
  });
}

/* ---------- SERVICES HUB ---------- */
{
  const cards = SERVICES.map(
    (s, i) => `
      <a class="card rv${i % 2 ? " rv-d1" : ""}" href="${s.slug}.html">
        <div class="card__media">
          ${img(s.img, {
            widths: s.imgRatio === "portrait" ? [700, 1000] : [600, 900],
            sizes: "(min-width:820px) 46vw, 92vw",
            alt: s.alt,
          })}
        </div>
        <div class="card__body">
          <span class="card__k">${s.kicker}</span>
          <h2 class="card__t">${s.title}</h2>
          <p class="card__d">${esc(s.lede)}</p>
          <span class="card__more">Read more ${ICON_ARROW}</span>
        </div>
      </a>`
  ).join("");

  pages.push({
    slug: "services",
    title: `Chauffeur Services in Dublin | ${BIZ.name}`,
    desc: "Airport transfers, corporate travel, business travel, weddings and events — chauffeur-driven across Dublin and Ireland with fixed fares.",
    active: "services",
    body: `
<section class="phero">
  <img class="phero__img" src="assets/img/hero-aviva-1920.webp" alt="" aria-hidden="true" decoding="async">
  <div class="phero__scrim" aria-hidden="true"></div>
  <div class="wrap phero__in">
    <nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="index.html">Home</a></li><li>Services</li></ol></nav>
    <h1 class="d1 phero__title">Services</h1>
    <p class="lede phero__sub">Five kinds of journey, one standard of car. Every fare is fixed before you travel.</p>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="svcs">${cards}
    </div>
  </div>
</section>`,
    schema: [localBusiness],
  });
}

/* ---------- SERVICE PAGES ---------- */
for (const s of SERVICES) {
  const others = SERVICES.filter((o) => o.slug !== s.slug).slice(0, 3);
  pages.push({
    slug: s.slug,
    title: `${s.title} | ${BIZ.name}`,
    desc: s.blurb,
    active: s.slug,
    ogImg: `${s.img}-${s.imgRatio === "portrait" ? 1000 : 900}.webp`,
    body: `
<section class="phero">
  <img class="phero__img" src="assets/img/${s.heroImg || s.img}-1400.webp" alt="" aria-hidden="true" decoding="async">
  <div class="phero__scrim" aria-hidden="true"></div>
  <div class="wrap phero__in">
    <nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="index.html">Home</a></li><li><a href="services.html">Services</a></li><li>${s.nav}</li></ol></nav>
    <h1 class="d1 phero__title">${s.title}</h1>
    <p class="lede phero__sub">${esc(s.lede)}</p>
    <div class="btn-row" style="margin-top:2rem">
      <a class="btn btn--primary" href="contact.html" data-magnetic>Get a fixed fare</a>
      <a class="btn btn--ghost" href="tel:${BIZ.telHref}">${BIZ.tel}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="split">
      <div class="split__media${s.imgRatio === "wide" ? " split__media--wide" : ""} rv">
        ${img(s.img, {
          widths: s.imgRatio === "portrait" ? [700, 1000] : [900, 1400],
          sizes: "(min-width:900px) 46vw, 92vw",
          alt: s.alt,
        })}
      </div>
      <div class="stack rv rv-d1">
        <span class="eyebrow">What you get</span>
        <h2 class="d2 leaf">${s.kicker}, without the admin</h2>
        <ul class="checks" style="margin-top:.5rem">
          ${s.points.map(([t, d]) => `<li>${ICON_CHECK}<span><b>${esc(t)}.</b> ${esc(d)}</span></li>`).join("\n          ")}
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section section--line">
  <div class="wrap">
    ${sectionHead("The car", "Which vehicle for this", s.vehicle)}
    ${fleetBlock(s.slug)}
  </div>
</section>

<section class="section section--line">
  <div class="wrap wrap--narrow">
    ${sectionHead("Questions", "About " + s.nav.toLowerCase(), "", true)}
    ${faqBlock(s.faq)}
  </div>
</section>

<section class="section section--line">
  <div class="wrap">
    ${sectionHead("Also", "Other ways we drive", "", true)}
    <div class="svcs">
      ${others
        .map(
          (o) => `<a class="card rv" href="${o.slug}.html">
        <div class="card__media">${img(o.img, {
          widths: o.imgRatio === "portrait" ? [700, 1000] : [600, 900],
          sizes: "(min-width:820px) 46vw, 92vw",
          alt: o.alt,
        })}</div>
        <div class="card__body">
          <span class="card__k">${o.kicker}</span>
          <h3 class="card__t">${o.nav}</h3>
          <p class="card__d">${esc(o.blurb)}</p>
          <span class="card__more">Read more ${ICON_ARROW}</span>
        </div>
      </a>`
        )
        .join("\n      ")}
    </div>
  </div>
</section>`,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: s.title,
        description: s.blurb,
        serviceType: s.kicker,
        provider: { "@id": SITE + "/#business" },
        areaServed: [{ "@type": "City", name: "Dublin" }, { "@type": "Country", name: "Ireland" }],
        url: `${SITE}/${s.slug}.html`,
      },
      faqSchema(s.faq),
    ],
  });
}

/* ---------- ABOUT / THE CAR ---------- */
pages.push({
  slug: "about",
  title: `The Car & The Chauffeur | ${BIZ.name}`,
  desc: "One black Mercedes-Benz E220d, cleaned before every journey, with Wi-Fi and chilled water on board. Chauffeur services across Dublin and Ireland.",
  active: "about",
  ogImg: "fleet-rear-900.webp",
  body: `
<section class="phero">
  <img class="phero__img" src="assets/img/city-eclass-1400.webp" alt="" aria-hidden="true" decoding="async">
  <div class="phero__scrim" aria-hidden="true"></div>
  <div class="wrap phero__in">
    <nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="index.html">Home</a></li><li>The car</li></ol></nav>
    <h1 class="d1 phero__title">One car, one standard</h1>
    <p class="lede phero__sub">We are not a fleet operator. There is one Mercedes-Benz E-Class, it is kept properly, and the person driving it is the person you spoke to.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="split">
      <div class="split__media rv">
        ${img("fleet-front", { widths: [700, 1000], sizes: "(min-width:900px) 46vw, 92vw", alt: "Front three-quarter view of a black Mercedes-Benz E-Class outside a modern office building in Dublin" })}
      </div>
      <div class="stack rv rv-d1">
        <span class="eyebrow">The vehicle</span>
        <h2 class="d2 leaf">Mercedes-Benz E220d, AMG Line</h2>
        <p class="lede">The saloon that most executive travel is actually done in, for good reasons: it is quiet at motorway speed, the rear seats are genuinely comfortable over an hour, and it does not announce itself.</p>
        <div class="specs" style="margin-top:.5rem">
          <div class="spec"><span class="spec__k">Model</span><span class="spec__v">Mercedes-Benz E220d</span></div>
          <div class="spec"><span class="spec__k">Trim</span><span class="spec__v">AMG Line, black</span></div>
          <div class="spec"><span class="spec__k">Passengers</span><span class="spec__v">${todo("Confirm seats")}</span></div>
          <div class="spec"><span class="spec__k">Luggage</span><span class="spec__v">${todo("Confirm capacity")}</span></div>
          <div class="spec"><span class="spec__k">Connectivity</span><span class="spec__v">On-board Wi-Fi</span></div>
          <div class="spec"><span class="spec__k">Refreshments</span><span class="spec__v">Chilled water</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--line">
  <div class="wrap">
    ${sectionHead("The standard", "What &ldquo;every detail, done in style&rdquo; actually means", "It is a tagline on the number plate. These are the things behind it.")}
    <div class="svcs">
      <div class="card rv" style="cursor:default">
        <div class="card__body">
          <span class="card__k">Before</span>
          <h3 class="card__t">Cleaned for you, not for the week</h3>
          <p class="card__d">The car is valeted before your journey, not on a schedule that happens to fall near it. Inside and out.</p>
        </div>
      </div>
      <div class="card rv rv-d1" style="cursor:default">
        <div class="card__body">
          <span class="card__k">During</span>
          <h3 class="card__t">Quiet unless you want otherwise</h3>
          <p class="card__d">Some people want to talk about the match. Some people want to take a call from Frankfurt. Your chauffeur reads which one you are.</p>
        </div>
      </div>
      <div class="card rv" style="cursor:default">
        <div class="card__body">
          <span class="card__k">Weather</span>
          <h3 class="card__t">An umbrella at every door</h3>
          <p class="card__d">This is Dublin. The umbrella is not a flourish, it is equipment, and it is out of the boot before you have unclipped the belt.</p>
        </div>
      </div>
      <div class="card rv rv-d1" style="cursor:default">
        <div class="card__body">
          <span class="card__k">After</span>
          <h3 class="card__t">One invoice, no surprises</h3>
          <p class="card__d">The fare quoted is the fare charged. Tolls and the first hour of airport waiting are already in it.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--line">
  <div class="wrap wrap--narrow stack rv" style="text-align:center;align-items:center">
    <span class="eyebrow">See it</span>
    <h2 class="d2 leaf">Thirty-seven seconds</h2>
    <p class="lede" style="max-width:52ch">Rather than describe the car again, here it is. The video loads only if you press play &mdash; it costs nothing until then.</p>
    <div data-video="${BIZ.video}" data-title="Jet Executive Travel — chauffeur service"
         style="position:relative;width:100%;aspect-ratio:16/9;margin-top:1.5rem;border:1px solid var(--line);border-radius:4px;overflow:hidden;cursor:pointer;background:var(--ink-2)"
         role="button" tabindex="0" aria-label="Play the Jet Executive Travel video">
      <img src="assets/img/events-glass-1400.webp" alt="" aria-hidden="true"
           style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.45)" loading="lazy" decoding="async">
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:78px;height:78px;border-radius:50%;background:var(--gold);color:#15120A">
          <svg width="26" height="28" viewBox="0 0 26 28" fill="currentColor" aria-hidden="true"><path d="M25 14 0 28V0l25 14Z"/></svg>
        </span>
      </span>
    </div>
  </div>
</section>`,
  schema: [localBusiness],
});


/* ---------- FLEET ---------- */
pages.push({
  slug: "fleet",
  title: `The Fleet | ${BIZ.name}`,
  desc: "Mercedes-Benz E-Class and S-Class chauffeur cars in Dublin, plus Sprinter vans and larger vehicles arranged through partner chauffeurs.",
  active: "fleet",
  ogImg: "fleet-front-1000.webp",
  body: `
<section class="phero">
  <img class="phero__img" src="assets/img/fleet-rear-1400.webp" alt="" aria-hidden="true" decoding="async">
  <div class="phero__scrim" aria-hidden="true"></div>
  <div class="wrap phero__in">
    <nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="index.html">Home</a></li><li>Fleet</li></ol></nav>
    <h1 class="d1 phero__title">The fleet</h1>
    <p class="lede phero__sub">Two Mercedes-Benz saloons of our own, and a route to anything larger. Pick the one that suits the journey &mdash; or tell us the journey and we will pick.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    ${fleetBlock("fleetpage")}
  </div>
</section>

<section class="section section--line">
  <div class="wrap">
    ${sectionHead("Beyond the three", "When you need something we do not park outside", "We would rather send you the right vehicle than talk you into the one we happen to own.")}
    <div class="split">
      <div class="split__media split__media--wide rv">
        ${img("city-eclass", { widths: [900, 1400], sizes: "(min-width:900px) 46vw, 92vw", alt: "Black Mercedes-Benz E-Class on a Dublin street at dusk" })}
      </div>
      <div class="stack rv rv-d1">
        <ul class="checks">
          <li>${ICON_CHECK}<span><b>Two cars in convoy.</b> A wedding party, a board that will not fit in one saloon, or a client and their team arriving on the same flight.</span></li>
          <li>${ICON_CHECK}<span><b>People carriers and minibuses.</b> Between a saloon and a Sprinter, for six or seven people with normal luggage.</span></li>
          <li>${ICON_CHECK}<span><b>Child seats, fitted in advance.</b> Tell us the ages when you book and it is in the car before you get to it, not wrestled in at the kerb.</span></li>
          <li>${ICON_CHECK}<span><b>Awkward luggage.</b> Golf clubs, skis, instruments, camera kit, trade-show cases. Say what it is and we will send something it fits in.</span></li>
        </ul>
        <p class="fleet__avail" style="margin-top:.5rem"><span><b>How the partner side works.</b> Anything we do not own is driven by chauffeurs we already work with, not sold on to whoever is cheapest that morning. You book once, you get one fixed fare, and if something goes wrong it is still our problem.</span></p>
        <div class="btn-row" style="margin-top:.5rem"><a class="btn btn--primary" href="contact.html" data-magnetic>Tell us what you need</a></div>
      </div>
    </div>
  </div>
</section>

<section class="section section--line">
  <div class="wrap">
    ${sectionHead("Every car", "What is true whichever one turns up", "")}
    <div class="steps rv">
      <div class="step"><span class="step__n num">01</span><h3 class="step__t">Cleaned before you</h3><p class="step__d">Valeted ahead of your journey, inside and out. Not on a rota.</p></div>
      <div class="step"><span class="step__n num">02</span><h3 class="step__t">Early as standard</h3><p class="step__d">The car is at the pickup before the pickup time, every time.</p></div>
      <div class="step"><span class="step__n num">03</span><h3 class="step__t">Wi-Fi and water</h3><p class="step__d">On board in both saloons, so the journey is usable time.</p></div>
      <div class="step"><span class="step__n num">04</span><h3 class="step__t">One fixed fare</h3><p class="step__d">Quoted before you travel and unchanged after. There is no meter.</p></div>
    </div>
  </div>
</section>

<section class="section section--line">
  <div class="wrap wrap--narrow">
    ${sectionHead("Questions", "About the cars", "", true)}
    ${faqBlock([
      ["Which car will I actually get?", "The E-Class unless you ask for something else, or unless the group and luggage will not fit in it. Whatever you book is what arrives — we will not quietly substitute a different vehicle on the day."],
      ["Can I request the S-Class?", "Yes. It is not the default, so ask when you book and we will confirm it is free for your date."],
      ["Do you own the Sprinter?", "No. Larger vehicles come from chauffeurs we work with and vouch for. You book through us and deal with us throughout — we do not hand you off."],
      ["Can you carry a large group?", "Yes, either in one larger vehicle or across several cars arriving together. Tell us the headcount and the luggage and we will quote the whole thing as one fare."],
      ["Can you fit a child seat?", "Yes, if you tell us the ages when you book. It is fitted before we collect you."],
    ])}
  </div>
</section>`,
  schema: [localBusiness],
});

/* ---------- CONTACT / BOOK ---------- */
pages.push({
  slug: "contact",
  title: `Book a Chauffeur in Dublin | ${BIZ.name}`,
  desc: "Send your journey and get a fixed fare back the same day. Dublin Airport transfers, corporate travel, weddings and events.",
  active: "contact",
  ogImg: "kerbside-900.webp",
  body: `
<section class="phero">
  <img class="phero__img" src="assets/img/street-eclass-1400.webp" alt="" aria-hidden="true" decoding="async">
  <div class="phero__scrim" aria-hidden="true"></div>
  <div class="wrap phero__in">
    <nav aria-label="Breadcrumb"><ol class="crumbs"><li><a href="index.html">Home</a></li><li>Book</li></ol></nav>
    <h1 class="d1 phero__title">Book a journey</h1>
    <p class="lede phero__sub">Tell us where and when. You will have a fixed fare back the same day &mdash; and if you are travelling today, calling is always faster.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="split" style="align-items:start">
      <div class="stack rv">
        <form class="form" id="booking-form" novalidate>
          <div class="form__grid form__grid--2">
            <div class="field">
              <label for="f-name">Name <span class="req" aria-hidden="true">*</span></label>
              <input id="f-name" name="Name" type="text" autocomplete="name" required>
              <p class="err" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-phone">Phone <span class="req" aria-hidden="true">*</span></label>
              <input id="f-phone" name="Phone" type="tel" autocomplete="tel" required>
              <p class="err" aria-live="polite"></p>
            </div>
          </div>

          <div class="field">
            <label for="f-email">Email <span class="req" aria-hidden="true">*</span></label>
            <input id="f-email" name="Email" type="email" autocomplete="email" required>
            <p class="err" aria-live="polite"></p>
          </div>

          <div class="field">
            <label for="f-service">What is the journey for? <span class="req" aria-hidden="true">*</span></label>
            <select id="f-service" name="Service" required>
              <option value="">Choose one</option>
              ${SERVICES.map((s) => `<option value="${s.nav}">${s.nav}</option>`).join("\n              ")}
              <option value="Something else">Something else</option>
            </select>
            <p class="err" aria-live="polite"></p>
          </div>

          <div class="form__grid form__grid--2">
            <div class="field">
              <label for="f-from">Pickup <span class="req" aria-hidden="true">*</span></label>
              <input id="f-from" name="Pickup" type="text" placeholder="Address, hotel or terminal" required>
              <p class="err" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-to">Drop-off <span class="req" aria-hidden="true">*</span></label>
              <input id="f-to" name="Dropoff" type="text" placeholder="Address, hotel or terminal" required>
              <p class="err" aria-live="polite"></p>
            </div>
          </div>

          <div class="form__grid form__grid--2">
            <div class="field">
              <label for="f-date">Date <span class="req" aria-hidden="true">*</span></label>
              <input id="f-date" name="Date" type="date" required>
              <p class="err" aria-live="polite"></p>
            </div>
            <div class="field">
              <label for="f-time">Pickup time <span class="req" aria-hidden="true">*</span></label>
              <input id="f-time" name="Time" type="time" required>
              <p class="err" aria-live="polite"></p>
            </div>
          </div>

          <div id="flight-block" hidden>
            <div class="form__grid form__grid--2">
              <div class="field">
                <label for="f-flight">Flight number <span class="hint">so we can track it</span></label>
                <input id="f-flight" name="Flight" type="text" placeholder="e.g. EI 175">
              </div>
              <div class="field">
                <label for="f-terminal">Terminal</label>
                <select id="f-terminal" name="Terminal">
                  <option value="">Not sure</option>
                  <option value="T1">Terminal 1</option>
                  <option value="T2">Terminal 2</option>
                </select>
              </div>
            </div>
          </div>

          <div class="form__grid form__grid--2">
            <div class="field">
              <label for="f-pax">Passengers</label>
              <select id="f-pax" name="Passengers">
                <option value="1">1</option><option value="2">2</option>
                <option value="3">3</option><option value="4+">4 or more</option>
              </select>
            </div>
            <div class="field">
              <label for="f-bags">Luggage</label>
              <select id="f-bags" name="Luggage">
                <option value="Hand luggage only">Hand luggage only</option>
                <option value="1-2 cases">1&ndash;2 cases</option>
                <option value="3+ cases">3 or more cases</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label id="trip-label">Trip type</label>
            <div class="radios" role="radiogroup" aria-labelledby="trip-label">
              <label class="radio"><input type="radio" name="trip" value="One way" checked><span>One way</span></label>
              <label class="radio"><input type="radio" name="trip" value="Return"><span>Return</span></label>
            </div>
          </div>

          <div id="return-block" hidden>
            <div class="form__grid form__grid--2">
              <div class="field">
                <label for="f-rdate">Return date</label>
                <input id="f-rdate" name="ReturnDate" type="date">
              </div>
              <div class="field">
                <label for="f-rtime">Return time</label>
                <input id="f-rtime" name="ReturnTime" type="time">
              </div>
            </div>
          </div>

          <div class="field">
            <label for="f-notes">Anything else</label>
            <textarea id="f-notes" name="Notes" placeholder="Child seat, extra stop, a name board for a client, wedding timings…"></textarea>
          </div>

          <button class="btn btn--primary" type="submit">Request this journey</button>
          <p class="err" id="form-error" aria-live="assertive"></p>
          <p class="form__note">We use these details to quote and run your journey, nothing else. No marketing list, no third parties. See our <a href="privacy.html">privacy notice</a>.</p>
        </form>

        <div class="form__ok" id="booking-ok" role="status">
          <h2 class="d3" style="margin-bottom:.75rem">Request received</h2>
          <p class="dim">We will come back with a fixed fare and confirm the details. If the journey is today, call <a href="tel:${BIZ.telHref}">${BIZ.tel}</a> so we can move on it straight away.</p>
        </div>
      </div>

      <aside class="stack rv rv-d1">
        <div class="specs">
          <div class="spec"><span class="spec__k">Call</span><span class="spec__v"><a href="tel:${BIZ.telHref}">${BIZ.tel}</a></span></div>
          <div class="spec"><span class="spec__k">Alternative</span><span class="spec__v"><a href="tel:${BIZ.tel2Href}">${BIZ.tel2}</a></span></div>
          <div class="spec"><span class="spec__k">Email</span><span class="spec__v"><a href="mailto:${BIZ.email}">${BIZ.email}</a></span></div>
          <div class="spec"><span class="spec__k">Hours</span><span class="spec__v">${todo("Confirm hours")}</span></div>
        </div>
        <div class="stack stack--sm" style="margin-top:1rem">
          <span class="eyebrow">Based in</span>
          <address class="dim" style="font-style:normal;line-height:1.75">
            ${BIZ.street}<br>${BIZ.area}, ${BIZ.city}<br>${BIZ.postal}
          </address>
        </div>
        <div class="split__media" style="margin-top:1rem">
          ${img("street-eclass", { widths: [600, 900], sizes: "(min-width:900px) 46vw, 92vw", alt: "Black Mercedes-Benz E-Class waiting on a Dublin street" })}
        </div>
      </aside>
    </div>
  </div>
</section>`,
  schema: [localBusiness],
});

/* ---------- PRIVACY ---------- */
pages.push({
  slug: "privacy",
  title: `Privacy & Cookies | ${BIZ.name}`,
  desc: "How Jet Executive Travel handles your booking details and what we measure on this site.",
  active: "",
  body: `
<section class="section" style="padding-top:calc(var(--header-h) + 3rem)">
  <div class="wrap wrap--narrow stack stack--lg">
    <div class="stack">
      <span class="eyebrow">Legal</span>
      <h1 class="d1">Privacy &amp; cookies</h1>
      <p class="lede">Short version: we collect what we need to drive you somewhere, and we measure nothing until you say yes.</p>
    </div>
    <div class="stack">
      <h2 class="d3">What we collect</h2>
      <p class="dim">When you send a booking request we receive your name, phone number, email address and the details of the journey. We use those to quote the fare, run the job, and contact you about it. That is the whole purpose.</p>
      <h2 class="d3">What we do not do</h2>
      <p class="dim">We do not sell your details, add you to a marketing list, or pass them to third parties for their own purposes. ${todo("Confirm retention period")} is how long we keep booking records before deleting them.</p>
      <h2 class="d3">Cookies and analytics</h2>
      <p class="dim">This site sets no analytics or marketing cookies until you accept them in the banner. If you decline, nothing is loaded and the site works exactly the same. Fonts are served from this domain rather than a third party, so visiting the site does not disclose your IP address to anyone else.</p>
      <h2 class="d3">Your rights</h2>
      <p class="dim">Under GDPR you can ask what we hold about you, ask us to correct it, or ask us to delete it. Email <a href="mailto:${BIZ.email}">${BIZ.email}</a> and we will deal with it. If you are unhappy with how we handle that, you can complain to the Irish Data Protection Commission at <a href="https://www.dataprotection.ie" rel="noopener">dataprotection.ie</a>.</p>
      <h2 class="d3">Contact</h2>
      <p class="dim">${BIZ.name}, ${BIZ.street}, ${BIZ.area}, ${BIZ.city}, ${BIZ.postal}. <a href="mailto:${BIZ.email}">${BIZ.email}</a> &middot; <a href="tel:${BIZ.telHref}">${BIZ.tel}</a></p>
      <p class="small dimmer">${todo("Have this reviewed")} &mdash; this is a working draft written from what the site actually does. Get it checked before launch.</p>
    </div>
  </div>
</section>`,
});

/* ------------------------------------------------------------------ write */
fs.mkdirSync(OUT, { recursive: true });
for (const p of pages) {
  fs.writeFileSync(path.join(OUT, p.slug + ".html"), shell(p), "utf8");
}

/* sitemap + robots */
const urls = pages.map((p) => `  <url><loc>${SITE}/${p.slug === "index" ? "" : p.slug + ".html"}</loc></url>`).join("\n");
fs.writeFileSync(
  path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log("built " + pages.length + " pages ->", OUT);
console.log(pages.map((p) => "  " + p.slug + ".html").join("\n"));
