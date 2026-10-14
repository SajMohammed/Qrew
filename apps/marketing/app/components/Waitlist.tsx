"use client";

import { useState } from "react";
import { postLead } from "../lib/lead";

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

  // Calm canvas and a white form card: the page spends its one vivid surface on the hero.
  return (
    <section className="mk-section" id="waitlist">
      <div className="mk-container mk-waitlist__grid">
        <div className="mk-waitlist__copy">
          <h2 className="sf-display sf-twotone">
            <span className="sf-lead">Get</span> <strong>early access</strong>
          </h2>
          <p className="sf-body-lg">
            Join the merchants shaping Qrew. We&apos;ll reach out to design your first card and get you
            live before launch.
          </p>
        </div>

        <div className="sf-card">
          {status === "done" ? (
            <div className="mk-done">
              <p className="sf-title sf-twotone">
                <span className="sf-lead">You&apos;re</span> <strong>on the list</strong>
              </p>
              <p>Thanks — we&apos;ll be in touch soon to set up your card.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="mk-form">
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
    </section>
  );
}
