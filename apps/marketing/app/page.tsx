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

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="q">Q</span>rew
    </span>
  );
}

function Nav() {
  return (
    <nav className="nav">
      <div className="container">
        <Wordmark />
        <a className="btn btn-ink" href="#waitlist">
          Get early access
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  const filled = [true, true, true, false, false];
  return (
    <header className="hero">
      <div className="container hero-grid">
        <div>
          <div className="eyebrow hero-eyebrow">Wallet-native loyalty · UAE</div>
          <h1>
            Loyalty that <span className="ink">sticks.</span>
          </h1>
          <p className="lead">
            Qrew turns your paper punch card into a beautiful digital stamp card — in Apple &amp;
            Google Wallet, no app to download. Set it up in minutes; watch customers come back.
          </p>
          <div className="hero-cta">
            <a className="btn btn-ink" href="#waitlist">
              Get early access
            </a>
            <a className="btn btn-ghost-light" href="#how">
              See how it works
            </a>
          </div>
          <div className="hero-trust">
            <span className="dot" />
            Made in the UAE · your data stays in-region
          </div>
        </div>

        <div className="mock">
          <div className="mock-card">
            <div className="mock-top">
              <div className="mock-logo">N</div>
              <div>
                <div className="mock-name">Nomad Coffee</div>
                <div className="mock-sub">Qrew Loyalty</div>
              </div>
            </div>
            <div className="mock-grid">
              {filled.concat([false, false, false, false, false]).map((on, i) => (
                <span key={i} className={`mock-dot${on ? " on" : ""}`}>
                  {on ? "☕" : ""}
                </span>
              ))}
            </div>
            <div className="mock-foot">
              <span className="mock-reward">Free coffee</span>
              <span className="mock-pill">3 of 10</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

const FEATURES = [
  {
    icon: "📲",
    title: "No app. Just Wallet.",
    body: "Customers add their card to Apple or Google Wallet from a QR at your counter. Nothing to download, nothing to forget on a home screen.",
  },
  {
    icon: "🎨",
    title: "Cards that look like you.",
    body: "Design a card in your colours, icon and reward in minutes. It's your brand in their pocket — not a generic template.",
  },
  {
    icon: "📊",
    title: "One fast dashboard.",
    body: "Every stamp, reward and repeat visit — live, in a dashboard built for a busy counter, not a spreadsheet.",
  },
];

function Features() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">Why Qrew</div>
          <h2>Loyalty your customers actually keep</h2>
          <p>Paper cards get lost. App downloads never happen. A wallet pass just… stays.</p>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="ic">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
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
    <section className="section how" id="how">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">How it works</div>
          <h2>Live in an afternoon</h2>
        </div>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const AUDIENCE = ["☕ Cafés", "💇 Salons", "💈 Barbers", "🥐 Bakeries", "🛍️ Boutiques", "🍔 Quick bites"];

function Audience() {
  return (
    <section className="section audience">
      <div className="container">
        <h2>
          Built for the UAE&apos;s best <span className="lime">independents</span>
        </h2>
        <div className="aud-row">
          {AUDIENCE.map((a) => (
            <span className="aud-chip" key={a}>
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
    <footer className="footer">
      <div className="container">
        <div>
          <Wordmark />
          <div className="tag">Loyalty that sticks.</div>
        </div>
        <div className="meta">
          © 2026 Qrew · Made in the UAE
          <br />
          Data &amp; PII hosted in AWS me-central-1
        </div>
      </div>
    </footer>
  );
}
