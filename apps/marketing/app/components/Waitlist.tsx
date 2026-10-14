"use client";

import { useState, type CSSProperties } from "react";
import { postLead } from "../lib/lead";
import { CheckIcon } from "./icons";

const PROMISES = [
  "We design your first card with you",
  "You're live before launch",
  "We only email about early access",
];

export function Waitlist() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErr(null);
    try {
      await postLead({ businessName, email, city: city || undefined });
      setStatus("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }

  // The page's closing lime moment: the signature aura, drifting, with the form card on it. Its only
  // white words sit in the deep top zone; the rest rides on light glass and the white card.
  return (
    <section className="mk-section" id="waitlist">
      <div className="mk-container">
        <div className="sf-aura sf-aura--drift mk-cta">
          <i className="mk-bubble mk-bubble--wide" aria-hidden style={{ "--s": "34px", "--x": "46%", "--y": "8%", "--d": "8s" } as CSSProperties} />
          <i className="mk-bubble" aria-hidden style={{ "--s": "20px", "--x": "40%", "--y": "84%", "--d": "10s" } as CSSProperties} />
          <i className="mk-bubble" aria-hidden style={{ "--s": "16px", "--x": "94%", "--y": "92%", "--d": "7s" } as CSSProperties} />

          <div className="mk-cta__copy">
            <h2 className="sf-display sf-twotone">
              <span className="sf-lead">Get</span> <strong>early access</strong>
            </h2>
            <ul className="mk-cta__promises">
              {PROMISES.map((p) => (
                <li key={p} className="mk-lg mk-lg--light sf-insight" data-liquid="9" data-bezel="18">
                  <span className="sf-bubble sf-bubble--sm sf-bubble--primary mk-cta__check" aria-hidden>
                    <CheckIcon />
                  </span>
                  <p className="sf-insight__title">{p}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="sf-card mk-cta__form">
            {status === "done" ? (
              <div className="mk-done">
                <span className="sf-bubble sf-bubble--primary sf-bubble--lg" aria-hidden>
                  <CheckIcon />
                </span>
                <p className="sf-title sf-twotone">
                  <span className="sf-lead">You&apos;re</span> <strong>on the list</strong>
                </p>
                <p>Thanks — we&apos;ll be in touch soon to set up your card.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mk-form">
                <p className="sf-body mk-muted">
                  Join the merchants shaping Qrew. We&apos;ll reach out to design your first card and get you
                  live before launch.
                </p>
                <div className="sf-field">
                  <label className="sf-field__label" htmlFor="biz">
                    Business name
                  </label>
                  <input
                    id="biz"
                    className="sf-input"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Nomad Coffee"
                    required
                    maxLength={120}
                  />
                </div>
                <div className="sf-field">
                  <label className="sf-field__label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    className="sf-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.ae"
                    required
                  />
                </div>
                <div className="sf-field">
                  <label className="sf-field__label" htmlFor="city">
                    City (optional)
                  </label>
                  <input
                    id="city"
                    className="sf-input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Dubai"
                    maxLength={80}
                  />
                </div>
                <button className="sf-btn sf-btn--primary sf-btn--lg sf-btn--block" type="submit" disabled={status === "sending"}>
                  {status === "sending" ? "Joining…" : "Join the waitlist"}
                </button>
                {err && <p className="mk-form__error">{err}</p>}
                <p className="mk-form__note">No spam. We&apos;ll only email about early access.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
