import type { CSSProperties, ReactNode } from "react";
import { Waitlist } from "./components/Waitlist";
import { HeroDemo } from "./components/HeroDemo";
import { CardDesigner } from "./components/CardDesigner";
import { ChartIcon, CheckIcon, PaletteIcon, QrIcon, WalletIcon } from "./components/icons";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Proof />
      <Why />
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

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A floating glass pill bar: the page scrolls under it, so the frost always has something to blur. */
function Nav() {
  return (
    <header className="mk-nav">
      <nav className="sf-glass sf-glass--strong mk-nav__bar" aria-label="Main">
        <Wordmark />
        <div className="mk-nav__links">
          <a className="mk-nav__link" href="#why">
            Why Qrew
          </a>
          <a className="mk-nav__link" href="#how">
            How it works
          </a>
          <a className="mk-nav__link" href="#who">
            Who it&apos;s for
          </a>
        </div>
        <a className="sf-btn sf-btn--primary" href="#waitlist">
          Get early access
        </a>
      </nav>
    </header>
  );
}

/** Soft lime foam behind the hero: blurred orbs that drift, and a few soap-bubble highlights. */
function Foam() {
  return (
    <div className="mk-foam" aria-hidden>
      <i className="mk-orb" style={vars({ "--s": "680px", "--x": "48%", "--y": "-18%", "--d": "26s", "--dx": "-40px", "--dy": "30px" })} />
      <i className="mk-orb mk-orb--deep" style={vars({ "--s": "460px", "--x": "70%", "--y": "34%", "--d": "22s", "--dx": "30px", "--dy": "-36px" })} />
      <i className="mk-orb mk-orb--pale" style={vars({ "--s": "360px", "--x": "-8%", "--y": "62%", "--d": "30s", "--dx": "50px", "--dy": "-20px" })} />
      <i className="mk-bubble mk-bubble--wide" style={vars({ "--s": "38px", "--x": "52%", "--y": "16%", "--d": "7s" })} />
      <i className="mk-bubble" style={vars({ "--s": "18px", "--x": "58%", "--y": "78%", "--d": "9s" })} />
      <i className="mk-bubble" style={vars({ "--s": "26px", "--x": "93%", "--y": "22%", "--d": "8s" })} />
      <i className="mk-bubble" style={vars({ "--s": "14px", "--x": "88%", "--y": "86%", "--d": "6s" })} />
      <i className="mk-bubble" style={vars({ "--s": "22px", "--x": "6%", "--y": "86%", "--d": "10s" })} />
    </div>
  );
}

function Hero() {
  return (
    <section className="mk-hero" id="top">
      <Foam />
      <div className="mk-container mk-hero__grid">
        <div className="mk-hero__copy">
          <span className="sf-tag mk-live">Wallet-native loyalty · UAE</span>
          <h1 className="mk-hero__title sf-twotone">
            <span className="sf-lead">Loyalty that</span> <strong className="mk-sticker">sticks.</strong>
          </h1>
          <p className="sf-body-lg mk-hero__lead">
            Qrew turns your paper punch card into a beautiful digital stamp card — in Apple &amp; Google
            Wallet, no app to download. Set it up in minutes; watch customers come back.
          </p>
          <div className="sf-cluster" style={vars({ "--gap": "12px" })}>
            <a className="sf-btn sf-btn--primary sf-btn--lg mk-glow" href="#waitlist">
              Get early access
            </a>
            <a className="sf-btn sf-btn--lg mk-btn-glass" href="#how">
              See how it works
            </a>
          </div>
          <p className="mk-trust">Made in the UAE · your data stays in-region</p>
        </div>
        <HeroDemo />
      </div>
    </section>
  );
}

/** Three readouts, true to the product, set like instruments. */
function Proof() {
  const items = [
    ["0", "apps to download"],
    ["2", "wallets: Apple & Google"],
    ["1", "QR at your counter"],
  ];
  return (
    <section className="mk-proof" aria-label="Qrew at a glance">
      <div className="mk-container mk-proof__row">
        {items.map(([n, label]) => (
          <div className="sf-glass sf-glass--strong mk-proof__item" key={label}>
            <span className="sf-figure sf-figure-lg">{n}</span>
            <span className="mk-proof__label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Head({ tag, lead, strong, children, center }: { tag?: string; lead: string; strong: string; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`mk-head${center ? " mk-head--center" : ""}`}>
      {tag && <span className="sf-tag">{tag}</span>}
      <h2 className="sf-display sf-twotone">
        <span className="sf-lead">{lead}</span> <strong>{strong}</strong>
      </h2>
      {children && <p className="sf-body-lg">{children}</p>}
    </div>
  );
}

function TileText({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mk-tile__text">
      <div className="sf-card__head">
        <h3 className="sf-heading">{title}</h3>
        <span className="sf-bubble" aria-hidden>
          {icon}
        </span>
      </div>
      <p className="sf-body mk-muted">{children}</p>
    </div>
  );
}

const PASSES = [
  { name: "Fade Barbers", colour: "#1f5673", stamps: 3, total: 6 },
  { name: "Mist Bakery", colour: "#b0413e", stamps: 5, total: 8 },
  { name: "Saba Coffee", colour: "#8a4b2f", stamps: 7, total: 10 },
];

function Why() {
  return (
    <section className="mk-section" id="why">
      <div className="mk-container">
        <Head tag="Why Qrew" lead="Loyalty your customers" strong="actually keep">
          Paper cards get lost. App downloads never happen. A wallet pass just… stays.
        </Head>

        <div className="mk-bento">
          <article className="sf-card mk-tile mk-tile--wallet">
            <TileText icon={<WalletIcon />} title="No app. Just Wallet.">
              Customers add their card to Apple or Google Wallet from a QR at your counter. Nothing to
              download, nothing to forget on a home screen.
            </TileText>
            {/* A customer's wallet: every shop's card in its own colour, stacked like Wallet stacks them. */}
            <div className="mk-tile__visual mk-stack" aria-hidden>
              {PASSES.map((p, i) => (
                <div
                  key={p.name}
                  className={`mk-pass mk-pass--${i + 1}${i === PASSES.length - 1 ? " sf-aura sf-aura--tint" : ""}`}
                  style={vars({ "--card-color": p.colour, "--tint": p.colour, "--on-tint": "#fbfbf7" })}
                >
                  <div className="mk-pass__head">
                    <p className="mk-pass__name">{p.name}</p>
                    <p className="mk-pass__count">
                      {p.stamps}/{p.total}
                    </p>
                  </div>
                  <ol className="sf-steps" style={vars({ "--dot": "12px" })}>
                    {Array.from({ length: p.total }, (_, k) => (
                      <li key={k} className={`sf-steps__dot${k < p.stamps ? " sf-steps__dot--done" : ""}`} />
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </article>

          <article className="sf-card mk-tile mk-tile--design">
            <TileText icon={<PaletteIcon />} title="Cards that look like you.">
              Design a card in your colours, icon and reward in minutes. It&apos;s your brand in their
              pocket — not a generic template.
            </TileText>
            <div className="mk-tile__visual">
              <CardDesigner />
            </div>
          </article>

          <article className="sf-card mk-tile mk-tile--dash">
            <TileText icon={<ChartIcon />} title="One fast dashboard.">
              Every stamp, reward and repeat visit — live, in a dashboard built for a busy counter, not a
              spreadsheet.
            </TileText>
            <div className="mk-tile__visual mk-dash" aria-hidden>
              <div className="sf-banner mk-dash__banner">
                <div className="sf-banner__main">
                  <p className="sf-banner__title">12 rewards waiting</p>
                  <p className="sf-banner__meta">Most redeem before 10am</p>
                </div>
                <span className="sf-btn sf-btn--ink sf-btn--sm">See who</span>
              </div>
              <div className="sf-card sf-card--compact">
                <p className="sf-card__label">Stamps today</p>
                <p className="sf-figure sf-figure-lg">
                  148<span className="sf-figure__sup sf-figure__sup--up">+12%</span>
                </p>
                <Spark />
              </div>
              <div className="sf-card sf-card--compact mk-dash__ring">
                <p className="sf-card__label">Come back</p>
                <div className="sf-ring" style={vars({ "--size": "92px" })}>
                  <svg viewBox="0 0 116 116">
                    <circle className="sf-ring__track" cx="58" cy="58" r="54" />
                    <circle className="sf-ring__arc" cx="58" cy="58" r="54" pathLength="100" strokeDasharray="68 100" />
                  </svg>
                  <div className="sf-ring__center">
                    <span className="sf-figure sf-figure-sm">
                      68<span className="sf-figure__unit">%</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Spark() {
  const v = [12, 18, 9, 22, 30, 26, 14, 19, 24, 33, 28, 20, 27, 35, 31, 23, 29, 38];
  return (
    <svg className="sf-spark" viewBox="0 0 132 40" aria-hidden>
      <line className="sf-spark__base" x1="0" y1="39" x2="132" y2="39" />
      {v.map((h, i) => (
        <line key={i} className={`sf-spark__tick${h < 15 ? " sf-spark__tick--muted" : ""}`} x1={4 + i * 7.2} y1="39" x2={4 + i * 7.2} y2={39 - h * 0.9} />
      ))}
      <circle className="sf-spark__mark" cx={4 + 17 * 7.2} cy={39 - 38 * 0.9} r="3.5" />
    </svg>
  );
}

const STEPS = [
  { n: "1", title: "Design your card", body: "Pick your colours, stamp icon and reward. It looks like your shop — done in minutes." },
  { n: "2", title: "Customers add it to Wallet", body: "They scan a QR at the counter and the card lands in Apple or Google Wallet instantly." },
  { n: "3", title: "They come back", body: "Staff scan, stamps add up, rewards pull them back — and you watch every visit live." },
];

function StepVisual({ n }: { n: string }) {
  if (n === "1")
    return (
      <div className="mk-step__visual" aria-hidden>
        {["#8a4b2f", "#146a2e", "#6c2a4b", "#1f5673"].map((c, i) => (
          <span key={c} className="mk-dot-swatch" style={vars({ "--c": c, "--i": i })} />
        ))}
      </div>
    );
  if (n === "2")
    return (
      <div className="mk-step__visual" aria-hidden>
        <div className="qrew-scanframe mk-mini-scan">
          <QrIcon />
        </div>
      </div>
    );
  return (
    <div className="mk-step__visual mk-step__visual--stack" aria-hidden>
      {/* Empty stamps underneath; the lime ones are revealed a stamp at a time, then the reward pops. */}
      <div className="mk-loop">
        {["", " sf-steps--signature mk-loop__fill"].map((variant) => (
          <ol key={variant} className={`sf-steps${variant}`} style={vars({ "--dot": "22px" })}>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className={`sf-steps__dot${variant ? " sf-steps__dot--done" : ""}`} />
            ))}
          </ol>
        ))}
      </div>
      <span className="sf-status sf-status--positive mk-loop__reward">
        <CheckIcon /> Reward ready
      </span>
    </div>
  );
}

function HowItWorks() {
  return (
    <section className="mk-section mk-how" id="how">
      <div className="mk-container">
        <Head tag="How it works" lead="Live in an" strong="afternoon" />
        <ol className="mk-steps">
          {STEPS.map((s) => (
            <li className="sf-card mk-step" key={s.n}>
              <StepVisual n={s.n} />
              <p className="sf-figure sf-figure-lg mk-step__n">{s.n}</p>
              <h3 className="sf-heading">{s.title}</h3>
              <p className="sf-body mk-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const AUDIENCE = [
  { name: "Cafés", c: "#8a4b2f" },
  { name: "Salons", c: "#b0413e" },
  { name: "Barbers", c: "#1f5673" },
  { name: "Bakeries", c: "#e8c9a0" },
  { name: "Boutiques", c: "#6c2a4b" },
  { name: "Quick bites", c: "#146a2e" },
];

function Audience() {
  const row = (hidden: boolean) =>
    AUDIENCE.map((a) => (
      <li key={`${a.name}-${hidden}`} className="sf-glass mk-chip" aria-hidden={hidden || undefined}>
        <span className="mk-chip__dot" style={vars({ "--c": a.c })} />
        {a.name}
      </li>
    ));
  return (
    <section className="mk-section mk-who" id="who">
      <div className="mk-container">
        <Head lead="Built for the UAE's best" strong="independents" center />
      </div>
      {/* The list runs twice so the marquee can loop seamlessly; the copy is hidden from screen readers. */}
      <div className="mk-marquee">
        <ul className="mk-marquee__track" aria-label="Who Qrew is for">
          {row(false)}
          {row(true)}
        </ul>
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
