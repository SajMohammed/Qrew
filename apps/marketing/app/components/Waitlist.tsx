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

  return (
    <section className="section waitlist" id="waitlist">
      <div className="container wl-grid">
        <div className="wl-copy">
          <h2>
            Get <span className="ink">early</span> access
          </h2>
          <p>
            Join the merchants shaping Qrew. We&apos;ll reach out to design your first card and get you
            live before launch.
          </p>
        </div>

        <div className="wl-card">
          {status === "done" ? (
            <div className="wl-done">
              <div className="big">You&apos;re on the list</div>
              <p>Thanks — we&apos;ll be in touch soon to set up your card. ☕</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="biz">Business name</label>
                <input
                  id="biz"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Nomad Coffee"
                  required
                  maxLength={120}
                />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.ae"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="city">City (optional)</label>
                <input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dubai" maxLength={80} />
              </div>
              <button className="btn btn-lime" type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Joining…" : "Join the waitlist"}
              </button>
              {err && <p className="wl-err">{err}</p>}
              <p className="wl-note">No spam. We&apos;ll only email about early access.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
