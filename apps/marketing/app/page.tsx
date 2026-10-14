import type { CSSProperties, ReactNode } from "react";
import { Waitlist } from "./components/Waitlist";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Audience />
      <Waitlist />
      <Footer />
    </main>
  );
}

/** Qrew's wordmark — the only place Anton appears. */
function Wordmark() {
  return <span className="qrew-wordmark">Qrew</span>;
}

/** Lucide icons (ISC licence), inlined at Softform's 1.6px stroke. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

function Nav() {
  return (
    <nav className="mk-nav">
      <div className="mk-container">
        <Wordmark />
        <a className="sf-btn sf-btn--ink" href="#waitlist">
          Get early access
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  const filled = 3;
  return (
    <header className="mk-hero">
      <div className="mk-container mk-hero__grid">
        <div className="mk-hero__copy">
          <span className="sf-tag">Wallet-native loyalty · UAE</span>
          <h1 className="sf-display-xl sf-twotone">
            <span className="sf-lead">Loyalty that</span> <strong>sticks.</strong>
          </h1>
          <p className="sf-body-lg mk-hero__lead">
            Qrew turns your paper punch card into a beautiful digital stamp card — in Apple &amp; Google
            Wallet, no app to download. Set it up in minutes; watch customers come back.
          </p>
          <div className="sf-cluster" style={{ "--gap": "12px" } as CSSProperties}>
            <a className="sf-btn sf-btn--primary sf-btn--lg" href="#waitlist">
              Get early access
            </a>
            <a className="sf-btn sf-btn--lg" href="#how">
              See how it works
            </a>
          </div>
          <p className="mk-trust">Made in the UAE · your data stays in-region</p>
        </div>

        {/*
          The page's one vivid moment: a signature aura as a stage, with the product itself floating on
          it — a shop's card (in the shop's colour, never Qrew's), a stamp landing, a live number.
        */}
        <div
          className="sf-aura mk-stage"
          role="img"
          aria-label="A Nomad Coffee stamp card with 3 of 10 stamps, a stamp landing, and 148 stamps today on the shop's dashboard"
        >
          <div className="sf-aura__top">
            <span className="mk-stage__label">Live at Nomad Coffee</span>
          </div>

          <div className="sf-toast mk-stage__toast">
            <Icon>
              <path d="M20 6 9 17l-5-5" />
            </Icon>
            Stamp added · 3 of 10
          </div>

          <article className="sf-aura sf-aura--tint qrew-card" style={{ "--card-color": "#7a2f54", "--card-ink": "#fbfbf7" } as CSSProperties}>
            <div className="qrew-card__top">
              <div className="qrew-card__shop">
                <span className="qrew-card__logo">N</span>
                <div>
                  <p className="qrew-card__name">Nomad Coffee</p>
                  <p className="qrew-card__program">Coffee club</p>
                </div>
              </div>
              <p className="sf-figure sf-figure-xl">
                {filled}
                <span className="sf-figure__sup">/10</span>
              </p>
            </div>
            <ol className="sf-steps" style={{ "--dot": "18px", justifyContent: "space-between" } as CSSProperties}>
              {Array.from({ length: 10 }, (_, i) => (
                <li key={i} className={`sf-steps__dot${i < filled ? " sf-steps__dot--done" : ""}`} />
              ))}
            </ol>
            <div className="qrew-card__foot">
              <span className="sf-tag">7 to a free coffee</span>
            </div>
          </article>

          <div className="sf-card sf-card--compact sf-metric mk-stage__metric">
            <p className="sf-card__label">Stamps today</p>
            <p className="sf-figure sf-figure-lg">
              148<span className="sf-figure__sup sf-figure__sup--up">+12%</span>
            </p>
            <svg className="sf-spark" viewBox="0 0 132 40" aria-hidden>
              <line className="sf-spark__base" x1="0" y1="39" x2="132" y2="39" />
              {[12, 18, 9, 22, 30, 26, 14, 19, 24, 33, 28, 20, 27, 35, 31, 23, 29, 38].map((v, i) => (
                <line
                  key={i}
                  className={`sf-spark__tick${v < 15 ? " sf-spark__tick--muted" : ""}`}
                  x1={4 + i * 7.2}
                  y1="39"
                  x2={4 + i * 7.2}
                  y2={39 - v * 0.9}
                />
              ))}
              <circle className="sf-spark__mark" cx={4 + 17 * 7.2} cy={39 - 38 * 0.9} r="3.5" />
            </svg>
          </div>
        </div>
      </div>
    </header>
  );
}

const FEATURES = [
  {
    icon: (
      <>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </>
    ),
    title: "No app. Just Wallet.",
    body: "Customers add their card to Apple or Google Wallet from a QR at your counter. Nothing to download, nothing to forget on a home screen.",
  },
  {
    icon: (
      <>
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2Z" />
      </>
    ),
    title: "Cards that look like you.",
    body: "Design a card in your colours, icon and reward in minutes. It's your brand in their pocket — not a generic template.",
  },
  {
    icon: (
      <>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </>
    ),
    title: "One fast dashboard.",
    body: "Every stamp, reward and repeat visit — live, in a dashboard built for a busy counter, not a spreadsheet.",
  },
];

function Features() {
  return (
    <section className="mk-section">
      <div className="mk-container">
        <div className="mk-head">
          <span className="sf-tag">Why Qrew</span>
          <h2 className="sf-display sf-twotone">
            <span className="sf-lead">Loyalty your customers</span> <strong>actually keep</strong>
          </h2>
          <p className="sf-body-lg">Paper cards get lost. App downloads never happen. A wallet pass just… stays.</p>
        </div>
        <div className="mk-grid">
          {FEATURES.map((f) => (
            <article className="sf-card" key={f.title}>
              <div className="sf-card__head">
                <h3 className="sf-heading">{f.title}</h3>
                <span className="sf-bubble" aria-hidden>
                  <Icon>{f.icon}</Icon>
                </span>
              </div>
              <p className="sf-body" style={{ color: "var(--ink-2)" }}>
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "1", title: "Design your card", body: "Pick your colours, stamp icon and reward. It looks like your shop — done in minutes." },
  { n: "2", title: "Customers add it to Wallet", body: "They scan a QR at the counter and the card lands in Apple or Google Wallet instantly." },
  { n: "3", title: "They come back", body: "Staff scan, stamps add up, rewards pull them back — and you watch every visit live." },
];

function HowItWorks() {
  return (
    <section className="mk-section" id="how">
      <div className="mk-container">
        <div className="mk-head">
          <span className="sf-tag">How it works</span>
          <h2 className="sf-display sf-twotone">
            <span className="sf-lead">Live in an</span> <strong>afternoon</strong>
          </h2>
        </div>
        <div className="mk-grid">
          {STEPS.map((s) => (
            <article className="sf-card mk-step" key={s.n}>
              <p className="sf-figure sf-figure-lg">{s.n}</p>
              <h3 className="sf-heading">{s.title}</h3>
              <p className="sf-body" style={{ color: "var(--ink-2)" }}>
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const AUDIENCE = ["Cafés", "Salons", "Barbers", "Bakeries", "Boutiques", "Quick bites"];

function Audience() {
  return (
    <section className="mk-section">
      <div className="mk-container mk-band">
        <h2 className="sf-display sf-twotone">
          <span className="sf-lead">Built for the UAE&apos;s best</span> <strong>independents</strong>
        </h2>
        <div className="sf-cluster" style={{ justifyContent: "center", "--gap": "10px" } as CSSProperties}>
          {AUDIENCE.map((a) => (
            <span className="sf-tag" key={a}>
              {a}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <div>
          <Wordmark />
          <p className="mk-footer__tag">Loyalty that sticks.</p>
        </div>
        <p className="mk-footer__meta">
          © 2026 Qrew · Made in the UAE
          <br />
          Data &amp; PII hosted in AWS me-central-1
        </p>
      </div>
    </footer>
  );
}
