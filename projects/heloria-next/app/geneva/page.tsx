"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const Stage1 = dynamic(() => import("@/components/geneva/Stage1"), {
  ssr: false,
});
const Stage2 = dynamic(() => import("@/components/geneva/Stage2"), {
  ssr: false,
});
const Stage3 = dynamic(() => import("@/components/geneva/Stage3"), {
  ssr: false,
});
const Stage4 = dynamic(() => import("@/components/geneva/Stage4"), {
  ssr: false,
});

/**
 * The Geneva drive, built in the open.
 *
 * A workbench route rather than a page — each step gets added here and judged
 * on its own before any of it goes near the site at `/`.
 */
export default function GenevaBench() {
  return (
    <div className="min-h-dvh bg-void font-dala text-bone">
      <header className="mx-auto max-w-[1280px] px-6 pb-8 pt-12">
        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 bg-ember" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-brass">
            Bench — Geneva drive
          </span>
        </div>
        <h1 className="mt-6 max-w-2xl font-tight text-[clamp(1.8rem,4vw,2.8rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          Step 1 — kinematics.
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-[1.55] text-steel">
          Outlines only, straight down the axis. Nothing here is meant to look
          good yet — the only question is whether the mechanism moves correctly.
          Watch the entry and exit: the cross should start and stop with no jerk
          at all, and sit dead still for three quarters of every revolution.
        </p>
      </header>

      <section className="mx-auto max-w-[1280px] px-6 pb-16">
        <figure className="relative h-[60vh] min-h-[420px] rounded-[8px_0_0_0] bg-kelp">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-baseline justify-between px-6 pt-5">
            <span className="text-[11px] uppercase tracking-[0.14em] text-brass">
              Fig. 01 — External Geneva, 4 slot
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate">
              Kinematic
            </span>
          </div>
          <Stage1 />
        </figure>

        <dl className="mt-10 grid gap-x-10 gap-y-6 border-t border-white/[0.09] pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Crank radius", "c · sin(π/n) = 0.7071"],
            ["Slot radius", "c · cos(π/n) = 0.7071"],
            ["Engagement", "±45° of driver — 25% duty"],
            ["Peak dφ/dθ", "1 + √2 = 2.4142"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-slate">
                {k}
              </dt>
              <dd className="mt-2 font-tight text-[15px] tabular-nums text-bone">
                {v}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 max-w-2xl text-[15px] leading-[1.6] text-steel">
          The mechanism starts and finishes every index at exactly zero angular
          velocity — the pin enters the slot along the slot&rsquo;s own
          centreline, so there is no step change in speed to absorb. That is why
          a Geneva reads as a snap rather than a jolt, and it is a property of
          the geometry rather than of any easing curve.
        </p>

        <hr className="my-20 border-white/[0.09]" />

        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 bg-ember" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-brass">
            Step 2 — machined parts
          </span>
        </div>
        <h2 className="mt-6 max-w-2xl font-tight text-[clamp(1.6rem,3.4vw,2.4rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          Outlines become metal.
        </h2>
        <p className="mt-4 max-w-xl text-[16px] leading-[1.55] text-steel">
          The same solved angles, now driving extruded profiles with real
          thickness: slots with radiused roots, four concave crescents cut by the
          locking disc, a gate in that disc for the cross&rsquo;s rim to pass
          through, and a roller on the crank pin that turns 1.32 times into the
          slot and 1.22 times back out. Every clearance here is sized against the
          chamfer, because <code className="text-brass">ExtrudeGeometry</code>
          pays for a chamfer by growing the part outward &mdash; which quietly
          turned an 0.008 gap into a 0.004 overlap the first time round. Still a
          placeholder grey; making it look like metal is the next step, and
          anything shinier here would only disguise whether the shapes are right.
        </p>

        <figure className="relative mt-10 h-[62vh] min-h-[440px] rounded-[8px_0_0_0] bg-kelp">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-baseline justify-between px-6 pt-5">
            <span className="text-[11px] uppercase tracking-[0.14em] text-brass">
              Fig. 02 — Assembly
            </span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate">
              Placeholder finish
            </span>
          </div>
          <Stage2 />
        </figure>

        <dl className="mt-10 grid gap-x-10 gap-y-6 border-t border-white/[0.09] pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Locking disc", "0.52 c — nests in the crescent"],
            ["Tooth between them", "7.85° of metal"],
            ["Roller in slot", "0.008 c clear, after chamfers"],
            ["Roller travel", "1.22 turns in, 1.22 back"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-slate">
                {k}
              </dt>
              <dd className="mt-2 font-tight text-[15px] text-bone">{v}</dd>
            </div>
          ))}
        </dl>

        <hr className="my-20 border-white/[0.09]" />

        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 bg-ember" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-brass">
            Step 4 &mdash; the drive
          </span>
        </div>
        <h2 className="mt-6 max-w-3xl font-tight text-[clamp(1.6rem,3.4vw,2.4rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          Three axes, not one.
        </h2>
        <p className="mt-4 max-w-xl text-[16px] leading-[1.55] text-steel">
          A flywheel and a spur pair on a horizontal shaft; a crown gear that
          turns the drive through ninety degrees into a four-slot Geneva lying
          flat; a second crown that turns it ninety degrees again into a
          three-slot Geneva standing on edge. Nine input turns per output turn,
          and the slow wheel moves for about a fiftieth of the cycle.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          <strong className="font-normal text-bone">
            Drag to look, scroll to run it.
          </strong>{" "}
          Six named views are listed beside the figure &mdash; the right-angle
          drives are invisible from the front, and a crown gear only makes sense
          once you can see a pinion&rsquo;s teeth dropping into its face rather
          than meeting its rim. Arrow keys turn it, number keys jump to a view,
          two fingers orbit on a phone.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          <strong className="font-normal text-bone">The drive has weight.</strong>{" "}
          Not scroll position mapped to an angle &mdash; the input shaft carries
          momentum, idles forward on its own, takes an impulse from the wheel and
          coasts back down. There is a flywheel in the model, and a flywheel that
          stores nothing is a decoration. Stop scrolling and the machine keeps
          going, which is the only way the dwell reads as a dwell.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          Anodised steel against brass, lit hard and low from one side. Hard and
          low because this machine is nothing but chamfers, tooth flanks and the
          edges of slots, and those only exist where a sharp light grazes them
          &mdash; an even wash renders the whole thing as one grey shape with
          holes in it. The environment is cool so the steel stays steel; all the
          warmth is in the key, where it lands on facing surfaces and leaves the
          shadow side cold. The rollers are the only colour in the machine
          &mdash; every one of them, wherever it rolls.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          The first version of this had every shaft parallel. That is not a
          styling choice &mdash; it makes a mechanism a flat drawing with
          thickness, and it stacked the slow stage directly in front of the fast
          one, hiding it. A crown gear&rsquo;s teeth stand on a face rather than
          a rim, so it meshes with an ordinary spur pinion whose axis crosses
          its own; hang a stage off that pinion and it is not merely elsewhere,
          it faces elsewhere.
        </p>

        <figure className="relative mt-10 h-[70vh] min-h-[480px] rounded-[8px_0_0_0] bg-kelp">
          <Stage3 />
        </figure>

        <dl className="mt-10 grid gap-x-10 gap-y-6 border-t border-white/[0.09] pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Reduction", "9 input turns per output turn"],
            ["Link", "24-tooth crown on an 18 pinion"],
            ["Peak dφ/dθ", "2.414 × 6.464 × 4/3 = 20.81"],
            ["Stage 2 margin", "30° at each end of a 120° jump"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-slate">
                {k}
              </dt>
              <dd className="mt-2 font-tight text-[15px] text-bone">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 max-w-2xl text-[15px] leading-[1.6] text-steel">
          The three-slot second stage is not decoration either. Its driver does
          not turn &mdash; it jumps 120&deg; at a time, and a Geneva has to take
          its whole engagement window in one jump or a pin is left parked inside
          a slot. Four slots would need exactly the jump it is given, with no
          margin at all; three need 60&deg;, leaving 30&deg; at each end. It also
          snaps harder, and both stages peak at the same instant.
        </p>

        <hr className="my-20 border-white/[0.09]" />

        <div className="flex items-center gap-3">
          <span className="h-1.5 w-1.5 bg-ember" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-brass">
            Step 5 &mdash; the freewheel
          </span>
        </div>
        <h2 className="mt-6 max-w-3xl font-tight text-[clamp(1.6rem,3.4vw,2.4rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          It can leave.
        </h2>
        <p className="mt-4 max-w-xl text-[16px] leading-[1.55] text-steel">
          Everything up to here exists to control a shaft &mdash; a Geneva is a
          mechanism for making something stop exactly when told and stay stopped.
          This is the one joint that gives that up. The slow cross snaps the
          output hub forward and lets go of it, and the hub keeps turning on its
          own with nothing driving it. It carries drive for about a two-hundredth
          of the cycle and is turning under no drive at all for four fifths of it.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          <strong className="font-normal text-bone">
            Not a ratchet.
          </strong>{" "}
          A pawl was built here once and read as a pinball flipper &mdash; a big
          sprung arm slapping a cog. A roller ramp does the same job by wedging:
          six rollers sit between flat cams on an inner star and the bore of the
          outer hub, in a gap that narrows one way only. Nothing retains them.
          They are round, and the only thing holding them is friction, which is
          why the whole component comes down to one inequality.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          The wedge angle has to fall inside the friction cone of both contacts,{" "}
          <code className="text-brass">&alpha; &le; 2&middot;arctan&micro;</code>.
          Dry steel on steel is about 0.1, so the cone closes at 11.4&deg;; this
          is cut at 6, a margin of 1.9. Wider and it slips under load, which for
          a clutch is not degraded performance but no clutch at all. Narrower and
          it never lets go. Oil one contact and it stops gripping in either
          direction &mdash; there is a test for that too.
        </p>
        <p className="mt-4 max-w-xl text-[15px] leading-[1.6] text-steel">
          <strong className="font-normal text-bone">
            The part nobody expects:
          </strong>{" "}
          the rollers barely move outward at all. Between free and locked each
          one lifts half a percent of the bore. A freewheel does not release by
          dropping away from anything &mdash; it releases by{" "}
          <em className="not-italic text-bone">sliding</em>, rolling a few
          degrees round into the wide part of its pocket, and that sideways
          travel is nineteen times the lift. Watch a roller as the index ends:
          it hardly drops, and it runs along.
        </p>

        <figure className="relative mt-10 h-[64vh] min-h-[440px] rounded-[8px_0_0_0] bg-kelp">
          <Stage4 />
        </figure>

        <dl className="mt-10 grid gap-x-10 gap-y-6 border-t border-white/[0.09] pt-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Wedge angle", "6° in an 11.4° cone — 1.9× margin"],
            ["Roller lift", "0.49% of the bore, 19× that along it"],
            ["Carrying drive", "0.43% of a nine-turn cycle"],
            ["Coast", "9 s to 1/e, re-engages in 50 ms"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-slate">
                {k}
              </dt>
              <dd className="mt-2 font-tight text-[15px] text-bone">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-10 max-w-2xl text-[15px] leading-[1.6] text-steel">
          The hub is the only other wheel here with holes cut through it. That is
          deliberate, and it is the same argument as the flywheel&rsquo;s spokes
          at the other end of the machine: those are the two parts whose subject
          is stored motion. A wheel turning at a constant speed with no features
          on it is invisible. One of them can never quite stop, and the other
          does not have to.
        </p>

        <Link
          href="/"
          className="mt-12 inline-block text-[13px] text-slate transition-colors hover:text-ember"
        >
          ← Heloria Labs
        </Link>
      </section>
    </div>
  );
}
