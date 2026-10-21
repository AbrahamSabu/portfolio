import { StageMachine } from "./StageMachine";

/**
 * The well the machine lives in.
 *
 * `fixed`, one element, outside `<main>`, and it never scrolls. The document
 * scrolls past it; the machine assembles according to how far down that
 * document the reader is. A canvas per section would be several WebGL
 * contexts, and browsers cap live contexts and take one back at the limit —
 * silently, leaving a blank panel.
 *
 * `aria-hidden`, because it is a picture of a mechanism that the text already
 * describes. Nothing here is information a reader can only get by looking.
 *
 * A server component. Only `StageMachine` inside it needs a browser.
 */
export function Stage() {
  return (
    <div
      aria-hidden
      /* Above the text on a phone, behind it from 768 up. On a phone the
         machine is a band the text scrolls UNDER; beside a column it is
         something the text sits next to. Below the header either way. */
      className="pointer-events-none fixed inset-0 z-20 overflow-hidden md:z-0"
    >
      {/* Where the machine is framed. Right half from 768px up, top on a
          phone — the text column is the other half in both cases.

          768, not 1024. The side-by-side layout started at `lg` at first,
          which handed the stacked phone arrangement to every laptop browser
          that was not fullscreen: the machine shrank to a strip under the
          header and the text scrolled straight across it.

          52% at `lg` and 48% from `xl`, because the text column is a fixed
          number of rem and the viewport is not. At 1024 the column ends at
          51% of the screen, and a well starting further left put the machine
          underneath the last word of every line. Measured, not guessed.

          The inner edge is feathered with a mask rather than covered with a
          scrim. The canvas is only as big as this box, so there is nothing to
          hide under the text — only a hard vertical line where the canvas
          stops, which a part swinging close to the edge would otherwise be
          sliced by. */}
      {/* On a phone: a band from under the header to 46% of the screen,
          opaque, so the text passes beneath it rather than across the
          machine — the arrangement the page had before this was a strip the
          words scrolled straight over. Its lower edge fades, so a line of
          text slides under softly instead of being sliced in half. `data-well`
          is how the page finds it to put the reading line below it. */}
      <div
        data-well
        className={[
          "absolute inset-x-0 top-[3.25rem] h-[calc(46svh-3.25rem)] bg-void",
          "[mask-image:linear-gradient(to_top,transparent,black_24%)]",
          "md:inset-y-0 md:top-0 md:left-[57%] md:h-auto md:w-[43%] md:bg-transparent",
          "md:[mask-image:linear-gradient(to_right,transparent,black_12%)]",
          "lg:left-[52%] lg:w-[48%]",
          "xl:left-[48%] xl:w-[52%]",
        ].join(" ")}
      >
        <StageMachine />
      </div>
    </div>
  );
}
