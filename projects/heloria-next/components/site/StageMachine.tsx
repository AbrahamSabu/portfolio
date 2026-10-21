"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useDocumentProgress } from "./useDocumentProgress";

/* The only thing on the page that skips the server. `ssr: false` has to live in
   a client component in this version of Next, and this is the smallest one
   that can hold it: every word on the page is still server-rendered. */
const MachineCanvas = dynamic(() => import("./MachineCanvas"), { ssr: false });

/**
 * Decides whether there is a machine at all, then hands it the reader's
 * position.
 *
 * Under reduced motion there is no canvas — not a frozen one. A machine
 * assembling as you scroll is motion by definition, and a still of a
 * half-built machine is a picture of nothing in particular. Those readers get
 * the finished machine as a still beside the text, and on a phone, ordinary
 * text.
 *
 * Also absent when WebGL is: a canvas that cannot get a context renders a
 * transparent rectangle, which on this page is indistinguishable from the
 * well being empty on purpose. Checking first means the absence is a decision.
 */
export function StageMachine() {
  const { reading, rest } = useDocumentProgress();
  /* Decided after mount, because the server cannot know either answer and a
     guess would hydrate into a mismatch. `null` is "not yet known", and
     renders nothing — which is also the reduced-motion answer, so the only
     visible transition is empty well to machine, never machine to empty. */
  const [mode, setMode] = useState<null | "off" | "narrow" | "wide">(null);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const phone = window.matchMedia("(max-width: 767px)");

    const decide = () => {
      const off = calm.matches || !hasWebGL();
      /* Tells the stylesheet, so the phone band and the room kept for it go
         too: see globals.css. */
      document.documentElement.dataset.machine = off ? "off" : "on";
      if (off) setMode("off");
      else setMode(phone.matches ? "narrow" : "wide");
    };
    decide();
    calm.addEventListener("change", decide);
    phone.addEventListener("change", decide);
    return () => {
      calm.removeEventListener("change", decide);
      phone.removeEventListener("change", decide);
    };
  }, []);

  if (mode === null) return null;
  /* No canvas: the finished machine as a still, rendered offline from the
     same geometry and the same closing camera (`node lib/shot.mts --stage
     freewheel --well 1000x1200 --finished`). A still of the finished machine
     is a picture of something, where a frozen half-built one was not. Hidden
     on a phone by the stylesheet, along with the band it would sit in. */
  if (mode === "off")
    return (
      <Image
        src="/machine-still.png"
        alt=""
        fill
        sizes="(min-width: 1280px) 52vw, 48vw"
        className="object-contain object-center"
      />
    );
  return <MachineCanvas reading={reading} rest={rest} narrow={mode === "narrow"} />;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return false;
    /* Asking the question opens a context, and this page's whole arrangement
       exists to hold exactly one. Hand the probe's back straight away rather
       than leaving it for the collector, so the real canvas is never the one
       that gets reclaimed. */
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
