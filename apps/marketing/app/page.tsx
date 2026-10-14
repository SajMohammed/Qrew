import type { CSSProperties, ReactNode } from "react";
import { Waitlist } from "./components/Waitlist";
import { HeroPhone } from "./components/HeroPhone";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { LiquidGlass } from "./components/LiquidGlass";
import { Pass, type PassData } from "./components/Pass";
import { Story } from "./components/Story";
import { Rewards } from "./components/Rewards";
import { Console } from "./components/Console";
import { ChartIcon, CheckIcon, PaletteIcon, PlusIcon, PrinterIcon, ScanIcon, WalletIcon, XIcon } from "./components/icons";

export default function Home() {
  return (
    <main>
      <LiquidGlass />
      <Nav />
      <Hero />
      <Proof />
      <Gallery />
      <Story />
      <Steps />
      <section className="mk-section" id="rewards">
        <div className="mk-container">
          <Head tag="One card, every kind of reward" lead="Reward them" strong="your way" center>
            Stamp cards are ready today. Points, a standing discount and members&apos; cards are coming soon.
          </Head>
          <Rewards />
        </div>
      </section>
      <section className="mk-section" id="shop">
        <div className="mk-container">
          <Head tag="Qrew Shop" lead="Your counter," strong="run from your phone">
            The app your team uses behind the counter, and the dashboard you check after close.
          </Head>
          <Console />
        </div>
      </section>
      <Compare />
      <Faq />
      <Waitlist />
      <Footer />
    </main>
  );
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Qrew's wordmark — the only place Anton appears. */
function Wordmark() {
  return <span className="qrew-wordmark">Qrew</span>;
}

/** A liquid glass bar floating over the page: what scrolls under it bends at its rim. */
function Nav() {
  return (
    <header className="mk-nav">
      <nav className="sf-liquid sf-liquid--tint mk-nav__bar" data-liquid="10" data-bezel="20" aria-label="Main">
        <a href="#top" aria-label="Qrew, back to top">
          <Wordmark />
        </a>
        <div className="mk-nav__links">
          <a className="mk-nav__link" href="#how">
            How it works
          </a>
          <a className="mk-nav__link" href="#rewards">
            Rewards
          </a>
          <a className="mk-nav__link" href="#shop">
            Qrew Shop
          </a>
          <a className="mk-nav__link" href="#faq">
            FAQ
          </a>
        </div>
        <div className="mk-nav__end">
          <ThemeSwitch />
          <a className="sf-btn sf-btn--primary mk-gel" href="#waitlist">
            Get early access
          </a>
        </div>
      </nav>
    </header>
  );
}

/** Lime jelly: glossy drops that slowly change shape behind the phone. */
function Jelly() {
  return (
    <div className="mk-jelly" aria-hidden>
      <i className="mk-jelly__glow" />
      <i className="mk-drop" style={vars({ "--s": "340px", "--x": "52%", "--y": "-4%", "--d": "16s" })} />
      <i className="mk-drop mk-drop--deep" style={vars({ "--s": "230px", "--x": "-6%", "--y": "56%", "--d": "19s" })} />
      <i className="mk-drop mk-drop--pale" style={vars({ "--s": "120px", "--x": "78%", "--y": "70%", "--d": "13s" })} />
      <i className="mk-drop" style={vars({ "--s": "54px", "--x": "8%", "--y": "18%", "--d": "11s" })} />
    </div>
  );
}

function Hero() {
  return (
    <section className="mk-hero" id="top">
      <div className="mk-container mk-hero__grid">
        <div className="mk-hero__copy">
          <span className="sf-liquid sf-liquid--tint mk-live mk-in" style={vars({ "--i": 0 })}>
            <i className="mk-live__dot" aria-hidden />
            Wallet loyalty for UAE shops
          </span>
          <h1 className="mk-hero__title sf-twotone">
            <span className="sf-lead mk-in" style={vars({ "--i": 1 })}>
              Loyalty that
            </span>{" "}
            <strong className="mk-sticker">sticks.</strong>
          </h1>
          <p className="sf-body-lg mk-hero__lead mk-in" style={vars({ "--i": 3 })}>
            Qrew turns your paper punch card into a digital stamp card that lives in your customers&apos; phone
            wallet. Nothing to download, nothing to lose — and every visit lands as a stamp, live.
          </p>
          <div className="sf-cluster mk-in" style={vars({ "--gap": "12px", "--i": 4 })}>
            <a className="sf-btn sf-btn--primary sf-btn--lg mk-gel mk-glow" href="#waitlist">
              Get early access
            </a>
            <a className="sf-btn sf-btn--lg sf-liquid sf-liquid--tint mk-gel" href="#how">
              See how it works
            </a>
          </div>
          <ul className="mk-trust mk-in" style={vars({ "--i": 5 })}>
            <li>No hardware to buy</li>
            <li>Set up in minutes</li>
            <li>Your data stays in the UAE</li>
          </ul>
        </div>

        <div className="mk-hero__stage">
          <Jelly />
          <HeroPhone />
          <div className="sf-liquid sf-liquid--tint mk-float mk-float--metric" data-liquid="10" data-bezel="20" aria-hidden>
            <p className="sf-card__label">Stamps today</p>
            <p className="sf-figure sf-figure-lg">
              148<span className="sf-figure__sup sf-figure__sup--up">+12%</span>
            </p>
          </div>
          <div className="sf-liquid sf-liquid--tint mk-float mk-float--regular" data-liquid="9" data-bezel="18" aria-hidden>
            <span className="sf-avatar sf-avatar--sm">S</span>
            <span>
              <b>Sara is back</b>
              9th visit this month
            </span>
          </div>
          {/* A clear drop of glass drifting over the edge of the phone: the lens at its plainest. */}
          <i className="sf-liquid mk-lens" data-liquid="26" data-bezel="56" aria-hidden />
        </div>
      </div>
    </section>
  );
}

/** Four facts, set like instruments. */
function Proof() {
  const items = [
    ["0", "apps for customers to download"],
    ["2", "wallets: Google now, Apple soon"],
    ["1", "QR code on your counter"],
    ["0", "hardware to buy"],
  ];
  return (
    <section className="mk-proof" aria-label="Qrew at a glance">
      <div className="mk-container mk-proof__row">
        {items.map(([n, label], i) => (
          <div className="sf-liquid sf-liquid--tint mk-proof__item" data-liquid="10" data-bezel="20" key={label} style={vars({ "--i": i })}>
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
      {tag && <span className="sf-tag mk-eyebrow">{tag}</span>}
      <h2 className="sf-display sf-twotone">
        <span className="sf-lead">{lead}</span> <strong>{strong}</strong>
      </h2>
      {children && <p className="sf-body-lg">{children}</p>}
    </div>
  );
}

const GALLERY: PassData[][] = [
  [
    { kind: "stamps", name: "Nomad Coffee", program: "Coffee club", colour: "#6c2a4b", have: 7, total: 10, tag: "3 to a free flat white" },
    { kind: "stamps", name: "Fade Barbers", program: "Cut club", colour: "#1f5673", have: 4, total: 6, tag: "2 to a free trim" },
    { kind: "stamps", name: "Mist Bakery", program: "Bread club", colour: "#b0413e", have: 5, total: 8, tag: "3 to a free loaf" },
    { kind: "stamps", name: "Saba Juice", program: "Juice card", colour: "#146a2e", have: 5, total: 8, tag: "3 to a juice on us" },
    { kind: "stamps", name: "Layla Salon", program: "Glow card", colour: "#8a4b2f", have: 3, total: 6, tag: "3 to a free blow-dry" },
    { kind: "stamps", name: "Karak House", program: "Chai card", colour: "#c2501b", have: 3, total: 5, tag: "2 to a free karak" },
  ],
  [
    { kind: "stamps", name: "Spin Car Wash", program: "Wash card", colour: "#1d6e69", have: 2, total: 5, tag: "3 to a free wash" },
    { kind: "stamps", name: "Bloom Florist", program: "Petal card", colour: "#962a68", have: 4, total: 6, tag: "2 to a free bouquet" },
    { kind: "stamps", name: "Daily Greens", program: "Bowl club", colour: "#2f5d50", have: 7, total: 10, tag: "3 to a free bowl" },
    { kind: "stamps", name: "Shawarma Spot", program: "Wrap card", colour: "#7d4e00", have: 6, total: 8, tag: "2 to a free wrap" },
    { kind: "stamps", name: "Iron Gym", program: "Class pass", colour: "#2b2f3a", have: 8, total: 12, tag: "4 to a free class" },
    { kind: "stamps", name: "Dune Bakery", program: "Crumb club", colour: "#e8c9a0", have: 6, total: 8, tag: "2 to a free cake" },
  ],
];

/** A card for every counter: shops' cards in their own colours, drifting past in two rows. */
function Gallery() {
  return (
    <section className="mk-section mk-gallery" aria-labelledby="gallery-title">
      <div className="mk-container">
        <div className="mk-head mk-head--center">
          <span className="sf-tag mk-eyebrow">Cafés · salons · barbers · bakeries · and more</span>
          <h2 id="gallery-title" className="sf-display sf-twotone">
            <span className="sf-lead">A card for</span> <strong>every counter</strong>
          </h2>
          <p className="sf-body-lg">Every shop&apos;s card in its own colours, with its own reward.</p>
        </div>
      </div>
      <div className="mk-gallery__rows" aria-hidden>
        {GALLERY.map((row, r) => (
          <div key={r} className={`mk-gallery__row${r ? " mk-gallery__row--back" : ""}`}>
            <div className="mk-gallery__track">
              {[...row, ...row].map((p, i) => (
                <Pass key={`${p.name}-${i}`} pass={p} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { icon: <PaletteIcon />, title: "Design your card", body: "Your colours, your logo or artwork, your reward. It looks like your shop, not a template." },
  { icon: <PrinterIcon />, title: "Put the QR on your counter", body: "Qrew makes a counter poster for you to print. One scan and a customer is in." },
  { icon: <WalletIcon />, title: "Customers add it to their wallet", body: "No app to download. The card saves straight to Google Wallet, with Apple Wallet coming soon." },
  { icon: <ScanIcon />, title: "Staff scan to stamp", body: "Any phone becomes the scanner. Each cashier has a PIN, and rewards redeem in one tap." },
  { icon: <ChartIcon />, title: "Watch them come back", body: "Visits, rewards and regulars, live — and who's slipping away before they're gone." },
];

function Steps() {
  return (
    <section className="mk-section mk-how" id="how">
      <div className="mk-container">
        <Head tag="How it works" lead="Live in" strong="an afternoon">
          No developers and no hardware. Just your card, a QR code and a phone at the counter.
        </Head>
        <ol className="mk-steps">
          {STEPS.map((s, i) => (
            <li className="mk-step" key={s.title} style={vars({ "--i": i })}>
              <span className="sf-liquid sf-liquid--tint mk-step__bubble" aria-hidden>
                {s.icon}
              </span>
              <p className="mk-step__n">Step {i + 1}</p>
              <h3 className="sf-heading">{s.title}</h3>
              <p className="sf-body mk-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const COMPARE = [
  {
    name: "Paper punch cards",
    points: ["Lost, washed or left at home", "Easy to fake with any stamp", "No idea who your regulars are"],
  },
  {
    name: "Building your own app",
    points: ["Costs a fortune to build and keep up", "Customers won't download it", "Months before it's live"],
  },
];

function Compare() {
  return (
    <section className="mk-section" aria-labelledby="compare-title">
      <div className="mk-container">
        <div className="mk-head mk-head--center">
          <span className="sf-tag mk-eyebrow">Why shops switch</span>
          <h2 id="compare-title" className="sf-display sf-twotone">
            <span className="sf-lead">The loyalty card,</span> <strong>done properly</strong>
          </h2>
        </div>
        <div className="mk-compare">
          {COMPARE.map((c) => (
            <div key={c.name} className="sf-card sf-card--sunken mk-compare__col">
              <h3 className="sf-heading">{c.name}</h3>
              <ul className="mk-compare__list">
                {c.points.map((p) => (
                  <li key={p}>
                    <span className="mk-compare__mark" aria-hidden>
                      <XIcon />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="sf-liquid sf-liquid--tint mk-compare__col mk-compare__col--qrew" data-liquid="12" data-bezel="24">
            <h3 className="sf-heading">
              <span className="qrew-wordmark">Qrew</span>
            </h3>
            <ul className="mk-compare__list">
              {["Lives in the wallet they already carry", "Stamps only from a staff scan", "Every regular, visit and reward on your dashboard", "Live in an afternoon"].map((p) => (
                <li key={p}>
                  <span className="mk-compare__mark mk-compare__mark--yes" aria-hidden>
                    <CheckIcon />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "Do my customers need to download an app?",
    a: "No. On Android, the card saves to Google Wallet, which is already on the phone; Apple Wallet for iPhone is coming soon. On any phone, customers can also keep every shop's card in the Qrew card app, right in their browser.",
  },
  {
    q: "What do I need at the counter?",
    a: "A phone. Qrew Shop runs in the browser, scans cards with the phone's camera and makes your counter QR as a poster to print. There are no card readers or tablets to buy.",
  },
  {
    q: "Can customers stamp their own cards?",
    a: "No. Your counter QR only adds the card to their wallet. Stamps come from a staff scan of the customer's own card, every cashier has their own PIN, and a reward can only be redeemed once.",
  },
  {
    q: "What kinds of reward can I run?",
    a: "Stamp cards are ready today: you choose how many stamps earn the reward, and what it is. Points, a standing discount and members' cards are coming soon.",
  },
  {
    q: "Where is my data kept?",
    a: "In the UAE. Qrew keeps your shop's and your customers' data in-region, on AWS in the UAE.",
  },
  {
    q: "How do I get started?",
    a: "Join the early-access list below. We'll get in touch to design your first card with you and get you live before launch.",
  },
];

function Faq() {
  return (
    <section className="mk-section" id="faq" aria-labelledby="faq-title">
      <div className="mk-container mk-faq">
        <div className="mk-head">
          <span className="sf-tag mk-eyebrow">FAQ</span>
          <h2 id="faq-title" className="sf-display sf-twotone">
            <span className="sf-lead">Questions,</span> <strong>answered</strong>
          </h2>
        </div>
        <div className="mk-faq__list">
          {FAQ.map((f) => (
            <details key={f.q} className="sf-liquid sf-liquid--tint mk-faq__item">
              <summary>
                {f.q}
                <span className="mk-faq__icon" aria-hidden>
                  <PlusIcon />
                </span>
              </summary>
              <p>{f.a}</p>
            </details>
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
        <nav className="mk-footer__links" aria-label="Footer">
          <a href="#how">How it works</a>
          <a href="#rewards">Rewards</a>
          <a href="#shop">Qrew Shop</a>
          <a href="#faq">FAQ</a>
          <a href="#waitlist">Early access</a>
        </nav>
        <p className="mk-footer__meta">
          © 2026 Qrew · Made in the UAE
          <br />
          Data &amp; PII hosted in AWS me-central-1
        </p>
      </div>
    </footer>
  );
}
