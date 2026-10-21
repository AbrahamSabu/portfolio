/* ==========================================================================
   Jet Executive Travel — behaviour + motion
   All motion is transform/opacity/mask only, and every effect no-ops under
   prefers-reduced-motion. No third-party script runs before consent.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- CONFIG — fill these in before going live -------------------------- */
  var GA_MEASUREMENT_ID = "";     // e.g. "G-XXXXXXXXXX". Empty = analytics off.
  var FORM_ENDPOINT     = "";     // e.g. "https://formspree.io/f/xxxxxxx". Empty = mailto fallback.
  var FORM_FALLBACK_TO  = "info@jetexecutivetravel.ie";
  /* ----------------------------------------------------------------------- */

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* =======================================================================
     Header: solid once scrolled off the hero
     ======================================================================= */
  var hdr = $(".hdr");
  var rail = $(".rail");
  function onScroll() {
    var y = window.scrollY;
    if (hdr) hdr.classList.toggle("is-stuck", y > 40);
    if (rail) rail.classList.toggle("is-up", y > 620);
  }
  var scrollQueued = false;
  window.addEventListener("scroll", function () {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(function () { onScroll(); scrollQueued = false; }); }
  }, { passive: true });
  onScroll();

  /* =======================================================================
     Mobile drawer
     ======================================================================= */
  var burger = $(".burger");
  var drawer = $(".drawer");
  if (burger && drawer) {
    var setDrawer = function (open) {
      burger.setAttribute("aria-expanded", String(open));
      drawer.classList.toggle("is-open", open);
      drawer.setAttribute("aria-hidden", String(!open));
      document.body.style.overflow = open ? "hidden" : "";
      if (open) { var f = drawer.querySelector("a"); if (f) f.focus({ preventScroll: true }); }
    };
    burger.addEventListener("click", function () {
      setDrawer(burger.getAttribute("aria-expanded") !== "true");
    });
    drawer.addEventListener("click", function (e) { if (e.target.closest("a")) setDrawer(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") { setDrawer(false); burger.focus(); }
    });
  }

  /* =======================================================================
     Scroll reveals + gold-leaf heading wipe
     ======================================================================= */
  var revealables = $$(".rv, .leaf");
  var revealAll = function () { revealables.forEach(function (el) { el.classList.add("is-in"); }); };

  if (reduce || !("IntersectionObserver" in window)) {
    revealAll();
  } else {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); revObs.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealables.forEach(function (el) { revObs.observe(el); });

    // Safety net: if the observer has not fired for anything after 2.5s — a
    // backgrounded tab, an occluded frame, a browser that throttles it — show
    // the page anyway. A reveal animation is never worth a blank page.
    setTimeout(function () {
      if (!document.querySelector(".rv.is-in")) revealAll();
    }, 2500);
  }

  /* =======================================================================
     Hero: headlight sweep — once per session, then the photo settles lit
     ======================================================================= */
  var heroMedia = $(".hero__media");
  var heroBase  = $(".hero__base");
  if (heroMedia && heroBase) {
    var alreadySwept = false;
    try { alreadySwept = sessionStorage.getItem("jet-swept") === "1"; } catch (e) {}

    var settle = function () { heroBase.style.filter = "brightness(.82) saturate(.92) contrast(1.03)"; };

    if (reduce || alreadySwept) {
      heroMedia.style.setProperty("--sweep", "50%");
      var lit = $(".hero__lit");
      if (lit) { lit.style.webkitMaskImage = "none"; lit.style.maskImage = "none"; lit.style.filter = "brightness(.82) saturate(.92)"; }
      heroBase.style.opacity = "0";
    } else {
      heroBase.style.transition = "filter 1.3s ease-out";
      var start = null, DUR = 2900;
      var sweep = function (ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / DUR, 1);
        // ease-in-out so the beam accelerates through the middle
        var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        heroMedia.style.setProperty("--sweep", (-30 + e * 162).toFixed(2) + "%");
        if (p < 1) requestAnimationFrame(sweep);
        else { settle(); try { sessionStorage.setItem("jet-swept", "1"); } catch (e2) {} }
      };
      setTimeout(function () { requestAnimationFrame(sweep); }, 260);
      setTimeout(settle, 2300);
    }
  }

  /* =======================================================================
     Hero parallax — 10px of separation, no more
     ======================================================================= */
  var heroImgs = $$(".hero__base, .hero__lit");
  if (heroImgs.length && !reduce && window.matchMedia("(pointer:fine)").matches) {
    var pQueued = false;
    window.addEventListener("scroll", function () {
      if (pQueued) return;
      pQueued = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, 900);
        heroImgs.forEach(function (im) { im.style.transform = "translate3d(0," + (y * 0.11).toFixed(1) + "px,0) scale(1.06)"; });
        pQueued = false;
      });
    }, { passive: true });
  }

  /* =======================================================================
     Route spine — the line fills as you scroll, stops light as you pass
     ======================================================================= */
  var spine = $(".spine");
  if (spine) {
    var fill  = $(".spine__fill", spine);
    var stops = $$(".spine__stop", spine);
    var sQueued = false;
    var updateSpine = function () {
      var r = spine.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = (vh * 0.62 - r.top) / r.height;
      p = Math.max(0, Math.min(1, p));
      if (fill) fill.style.setProperty("--p", reduce ? 1 : p.toFixed(4));
      stops.forEach(function (st) {
        var sr = st.getBoundingClientRect();
        st.classList.toggle("is-lit", reduce || sr.top < vh * 0.66);
      });
      sQueued = false;
    };
    window.addEventListener("scroll", function () {
      if (!sQueued) { sQueued = true; requestAnimationFrame(updateSpine); }
    }, { passive: true });
    window.addEventListener("resize", updateSpine, { passive: true });
    updateSpine();
  }

  /* =======================================================================
     Odometer counters
     ======================================================================= */
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target)) return;
    var dec    = parseInt(el.getAttribute("data-dec") || "0", 10);
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduce) { el.textContent = prefix + target.toFixed(dec) + suffix; return; }
    var start = null, DUR = 1500;
    (function tick(ts) {
      if (ts === undefined) { requestAnimationFrame(tick); return; }
      if (start === null) start = ts;
      var p = Math.min((ts - start) / DUR, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * e).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })();
  }
  var counters = $$("[data-count]");
  if (counters.length) {
    if (reduce || !("IntersectionObserver" in window)) counters.forEach(countUp);
    else {
      var cObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { countUp(en.target); cObs.unobserve(en.target); }
        });
      }, { threshold: 0.6 });
      counters.forEach(function (c) { cObs.observe(c); });
    }
  }

  /* =======================================================================
     Magnetic CTA — exactly one per page, pointer devices only
     ======================================================================= */
  var mag = $("[data-magnetic]");
  if (mag && !reduce && window.matchMedia("(pointer:fine)").matches) {
    var zone = mag.parentElement;
    zone.addEventListener("pointermove", function (ev) {
      var r = mag.getBoundingClientRect();
      var dx = ev.clientX - (r.left + r.width / 2);
      var dy = ev.clientY - (r.top + r.height / 2);
      var d  = Math.hypot(dx, dy) || 1;
      if (d < 140) {
        var pull = (1 - d / 140) * 9;
        mag.style.transform = "translate(" + ((dx / d) * pull).toFixed(1) + "px," + ((dy / d) * pull).toFixed(1) + "px)";
      } else mag.style.transform = "";
    });
    zone.addEventListener("pointerleave", function () { mag.style.transform = ""; });
  }

  /* =======================================================================
     Video facade — YouTube only loads when someone asks for it.
     Saves ~700KB and a third-party connection on first paint.
     ======================================================================= */
  $$("[data-video]").forEach(function (fac) {
    fac.addEventListener("click", function () {
      var id = fac.getAttribute("data-video");
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
      f.title = fac.getAttribute("data-title") || "Video";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen = true;
      f.loading = "lazy";
      f.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0";
      fac.innerHTML = "";
      fac.appendChild(f);
      fac.removeAttribute("data-video");
    });
  });

  /* =======================================================================
     Consent — nothing third-party fires until this returns true
     ======================================================================= */
  var consent = $(".consent");
  function analyticsOn() {
    if (!GA_MEASUREMENT_ID) return;
    if (window.__jetGA) return;
    window.__jetGA = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true });
  }
  if (consent) {
    var stored = null;
    try { stored = localStorage.getItem("jet-consent"); } catch (e) {}
    if (stored === "yes") analyticsOn();
    else if (stored !== "no") setTimeout(function () { consent.classList.add("is-shown"); }, 1200);

    consent.addEventListener("click", function (e) {
      var b = e.target.closest("[data-consent]");
      if (!b) return;
      var v = b.getAttribute("data-consent");
      try { localStorage.setItem("jet-consent", v); } catch (e2) {}
      if (v === "yes") analyticsOn();
      consent.classList.remove("is-shown");
    });
  }

  /* =======================================================================
     Booking form — validation, conditional legs, honest submit
     ======================================================================= */
  var form = $("#booking-form");
  if (form) {
    var ok = $("#booking-ok", form.parentNode);

    // return-leg fields only when a return is selected
    var retBlock = $("#return-block");
    var syncReturn = function () {
      var isReturn = form.querySelector('input[name="trip"]:checked');
      var on = isReturn && isReturn.value === "Return";
      if (retBlock) {
        retBlock.hidden = !on;
        $$("input,select", retBlock).forEach(function (i) { i.disabled = !on; });
      }
    };
    $$('input[name="trip"]', form).forEach(function (r) { r.addEventListener("change", syncReturn); });
    syncReturn();

    // flight number only matters for airport journeys
    var flightBlock = $("#flight-block");
    var svcSel = $("#f-service", form);
    var syncFlight = function () {
      if (!flightBlock || !svcSel) return;
      var on = /airport/i.test(svcSel.value);
      flightBlock.hidden = !on;
      $$("input", flightBlock).forEach(function (i) { i.disabled = !on; });
    };
    if (svcSel) svcSel.addEventListener("change", syncFlight);
    syncFlight();

    var showErr = function (input, msg) {
      var f = input.closest(".field");
      var e = f && $(".err", f);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (e) e.textContent = msg || "";
    };

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var firstBad = null;
      $$("[required]", form).forEach(function (input) {
        if (input.disabled) return;
        var bad = "";
        if (!input.value.trim()) bad = "Please fill this in.";
        else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value)) bad = "That email address does not look right.";
        else if (input.type === "tel" && input.value.replace(/[^\d]/g, "").length < 7) bad = "Please include a full contact number.";
        showErr(input, bad);
        if (bad && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }

      var data = new FormData(form);
      var done = function () {
        form.hidden = true;
        if (ok) { ok.classList.add("is-shown"); ok.setAttribute("tabindex", "-1"); ok.focus(); }
      };

      if (FORM_ENDPOINT) {
        var btn = $('button[type="submit"]', form);
        if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
        fetch(FORM_ENDPOINT, { method: "POST", body: data, headers: { Accept: "application/json" } })
          .then(function (r) {
            if (r.ok) done();
            else throw new Error("bad response");
          })
          .catch(function () {
            if (btn) { btn.disabled = false; btn.textContent = "Request this journey"; }
            var e = $("#form-error");
            if (e) e.textContent = "That did not send. Please call +353 87 623 9810 and we will take the booking directly.";
          });
      } else {
        // No endpoint configured yet: hand the enquiry to the mail client rather
        // than pretending it was sent.
        var lines = [];
        data.forEach(function (v, k) { if (String(v).trim()) lines.push(k + ": " + v); });
        window.location.href = "mailto:" + FORM_FALLBACK_TO +
          "?subject=" + encodeURIComponent("Chauffeur booking request") +
          "&body=" + encodeURIComponent(lines.join("\n"));
        done();
      }
    });

    $$("input,select,textarea", form).forEach(function (i) {
      i.addEventListener("input", function () { if (i.getAttribute("aria-invalid") === "true") showErr(i, ""); });
    });
  }

  /* =======================================================================
     Cross-page view transitions, where supported
     ======================================================================= */
  if (document.startViewTransition && !reduce) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href]:not([target]):not([download])');
      if (!a) return;
      // Same-document jump links are never a page transition. Check the raw
      // attribute, not the resolved URL: a <base> tag rewrites "#fares" into a
      // different pathname, and this handler would then navigate away from the
      // page entirely instead of scrolling down it.
      var raw = a.getAttribute("href") || "";
      if (raw.charAt(0) === "#") return;
      var url;
      try { url = new URL(a.href); } catch (err) { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      document.startViewTransition(function () { location.href = a.href; });
    });
  }

  /* =======================================================================
     Fleet selector — tabs, and line-art that draws itself in
     ======================================================================= */
  $$("[data-fleet]").forEach(function (fleet) {
    var tabs = $$(".fleet__tab", fleet);
    var arts = $$(".fleet__art", fleet);
    var panels = $$("[data-vehicle-panel]", fleet);
    if (!tabs.length) return;

    /* ---- vehicle morph -------------------------------------------------
       Every outline is stored as two arrays of y values sampled at the same
       normalised x positions, so nose maps to nose and roof maps to roof and
       the morph is a straight interpolation — no writhing, no point matching
       at runtime. One car lengthens into the next. */
    var dataEl = $(".fleet__data", fleet);
    var svg = $(".fleet__svg", fleet);
    var morph = null;
    if (dataEl && svg) {
      try { morph = JSON.parse(dataEl.textContent); } catch (e) { morph = null; }
    }
    if (morph) {
      var mBody = $(".body", svg), mGlass = $(".glass", svg);
      var mTyres = $$(".tyre", svg), mHubs = $$(".hub", svg);
      var xAt = function (i) { return morph.X0 + (morph.X1 - morph.X0) * i / (morph.N - 1); };

      var render = function (s) {
        var d = "", i;
        for (i = 0; i < morph.N; i++) d += (i ? "L" : "M") + xAt(i).toFixed(1) + " " + s.top[i].toFixed(1);
        for (i = morph.N - 1; i >= 0; i--) d += "L" + xAt(i).toFixed(1) + " " + s.bot[i].toFixed(1);
        mBody.setAttribute("d", d + "Z");

        var g0 = Math.round(s.g0), g1 = Math.round(s.g1);
        if (mGlass && g1 > g0 + 1) {
          var gd = "";
          for (i = g0; i <= g1; i++) gd += (i === g0 ? "M" : "L") + xAt(i).toFixed(1) + " " + s.top[i].toFixed(1);
          gd += "L" + xAt(g1).toFixed(1) + " " + s.belt.toFixed(1);
          gd += "L" + xAt(g0).toFixed(1) + " " + s.belt.toFixed(1) + "Z";
          mGlass.setAttribute("d", gd);
        }
        s.wheels.forEach(function (w, n) {
          if (mTyres[n]) { mTyres[n].setAttribute("cx", w.cx.toFixed(1)); mTyres[n].setAttribute("cy", w.cy.toFixed(1)); mTyres[n].setAttribute("r", w.r.toFixed(1)); }
          if (mHubs[n]) { mHubs[n].setAttribute("cx", w.cx.toFixed(1)); mHubs[n].setAttribute("cy", w.cy.toFixed(1)); mHubs[n].setAttribute("r", (w.r * 0.44).toFixed(1)); }
        });
      };

      var stateOf = function (key) {
        var v = morph.v[key];
        return { top: v.top, bot: v.bot, belt: v.belt, g0: v.glass[0], g1: v.glass[1], wheels: v.wheels };
      };
      var mix = function (a, b, t) {
        var L = function (x, y) { return x + (y - x) * t; };
        return {
          top: a.top.map(function (y, i) { return L(y, b.top[i]); }),
          bot: a.bot.map(function (y, i) { return L(y, b.bot[i]); }),
          belt: L(a.belt, b.belt), g0: L(a.g0, b.g0), g1: L(a.g1, b.g1),
          wheels: a.wheels.map(function (w, i) {
            var o = b.wheels[i] || w;
            return { cx: L(w.cx, o.cx), cy: L(w.cy, o.cy), r: L(w.r, o.r) };
          }),
        };
      };

      var current = stateOf(tabs[0].getAttribute("data-v"));
      var raf = null, settleTimer = null;
      var morphTo = function (key, instant) {
        var from = current, to = stateOf(key);
        if (raf) cancelAnimationFrame(raf);
        if (settleTimer) clearTimeout(settleTimer);
        // A path whose length changes cannot keep the draw-in dash pattern, or
        // the far end of the outline gets clipped. Once it morphs, it is solid.
        $$("path, circle", svg).forEach(function (p) { p.style.strokeDasharray = "none"; });
        var DUR = 820;
        if (instant || reduce) { current = to; render(to); return; }
        var t0 = null;
        var step = function (ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min((ts - t0) / DUR, 1);
          var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          render(mix(from, to, e));
          if (p < 1) raf = requestAnimationFrame(step);
          else { current = to; raf = null; }
        };
        raf = requestAnimationFrame(step);
        /* rAF is paused in a hidden or heavily throttled tab, which would leave
           the outline frozen part-way between two vehicles. Timers still run,
           so guarantee the end state independently of the animation. */
        settleTimer = setTimeout(function () {
          if (raf) { cancelAnimationFrame(raf); raf = null; }
          current = to; render(to);
        }, DUR + 260);
        // light travels across the shape as it settles — the house rule
        var sheen = $(".fleet__sheen", fleet);
        if (sheen) { sheen.classList.remove("is-sweeping"); void sheen.offsetWidth; sheen.classList.add("is-sweeping"); }
      };
      fleet.__morphTo = morphTo;
    }

    // Give every stroke its own dash length so each one unrolls at its own rate.
    arts.forEach(function (art) {
      $$("path, circle", art).forEach(function (p) {
        if (p.classList.contains("ground")) return;
        var len = 0;
        try { len = p.getTotalLength(); } catch (e) {}
        if (len) p.style.setProperty("--len", Math.ceil(len));
      });
    });

    /* The first appearance draws the outline in; every switch after that
       morphs from the shape already on screen. */
    var art = arts[0];
    var revealed = false;
    var show = function (key, moveFocus) {
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-v") === key;
        t.setAttribute("aria-selected", String(on));
        t.setAttribute("tabindex", on ? "0" : "-1");
        if (on && moveFocus) t.focus();
      });
      panels.forEach(function (p) {
        p.hidden = p.getAttribute("data-vehicle-panel") !== key;
      });
      if (fleet.__morphTo) fleet.__morphTo(key, !revealed);
    };

    var revealOnce = function (key) {
      if (revealed) return;
      revealed = true;
      if (art) {
        // A timer, not requestAnimationFrame: rAF never fires in a hidden or
        // throttled tab, and an undrawn silhouette is an empty box.
        art.classList.remove("is-drawn");
        setTimeout(function () { art.classList.add("is-drawn"); }, 40);
      }
    };

    tabs.forEach(function (t) {
      t.addEventListener("click", function () { show(t.getAttribute("data-v"), false); });
      t.addEventListener("keydown", function (e) {
        var i = tabs.indexOf(t);
        var next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1
                 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
        if (next < 0 && next !== 0) return;
        e.preventDefault();
        next = (next + tabs.length) % tabs.length;
        show(tabs[next].getAttribute("data-v"), true);
      });
    });

    var first = tabs[0].getAttribute("data-v");
    show(first, false);

    // Hold the draw-in until the component is on screen, so nobody scrolls
    // past the one moment it animates.
    if (reduce || !("IntersectionObserver" in window)) {
      revealOnce(first);
    } else {
      var fObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          fObs.disconnect();
          revealOnce(first);
        });
      }, { threshold: 0.3 });
      fObs.observe(fleet);
      setTimeout(function () { fObs.disconnect(); revealOnce(first); }, 2600);
    }
  });

  /* current year in the footer */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
