import type { CSSProperties, ReactNode } from "react";
import { CardDesigner } from "./CardDesigner";
import { ChartIcon, CheckIcon, ClockIcon, PaletteIcon, QrIcon, ScanIcon, ShieldIcon, UsersIcon, XIcon } from "./icons";

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/**
 * Qrew Shop, the app behind the counter: six things it does, each shown rather than described. Every
 * visual is a still of the real screen, built from the same Softform components.
 */
export function Console() {
  return (
    <div className="mk-bento">
      <Tile
        className="mk-tile--counter"
        icon={<ScanIcon />}
        title="Scan, stamp, done."
        text="Any phone becomes the counter scanner. Staff scan the customer's card, the stamp lands, and the queue keeps moving."
      >
        <Visual>
          <div className="qrew-scanframe mk-scan">
            <QrIcon />
          </div>
          <div className="sf-toast mk-scan__result">
            <CheckIcon />
            Stamp added · Sara, 5 of 8
          </div>
        </Visual>
      </Tile>

      <Tile
        className="mk-tile--dash"
        icon={<ChartIcon />}
        title="Know who came back."
        text="Visits, repeat rate and rewards waiting, live — and the regulars worth a thank-you."
      >
        <Visual className="mk-dash">
          <div className="sf-banner">
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
            <p className="sf-card__label">Came back</p>
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
        </Visual>
      </Tile>

      <Tile
        className="mk-tile--risk"
        icon={<ClockIcon />}
        title="Catch regulars slipping away."
        text="Qrew flags customers who've stopped coming, so you can win them back before they're gone."
      >
        <Visual>
          <ul className="sf-rows sf-rows--wells mk-people">
            {[
              { name: "Omar K.", meta: "14 visits · last seen 3 weeks ago", status: "At risk", tone: "warning" },
              { name: "Sara M.", meta: "9 visits · here yesterday", status: "Reward ready", tone: "positive" },
              { name: "Priya R.", meta: "22 visits · here today", status: "Regular", tone: "info" },
            ].map((p) => (
              <li key={p.name} className="sf-row sf-row--well">
                <span className="sf-avatar sf-avatar--sm">{p.name[0]}</span>
                <span className="sf-row__main">
                  <span className="sf-row__title">{p.name}</span>
                  <span className="sf-row__meta">{p.meta}</span>
                </span>
                <span className={`sf-status sf-status--${p.tone}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        </Visual>
      </Tile>

      <Tile
        className="mk-tile--staff"
        icon={<UsersIcon />}
        title="Every cashier, their own PIN."
        text="Owners, managers and cashiers each see what they need. Cashiers stamp; only you see the numbers."
      >
        <Visual>
          <ul className="sf-rows sf-rows--wells mk-people">
            {[
              { name: "You", role: "Owner" },
              { name: "Hana", role: "Manager" },
              { name: "Ravi", role: "Cashier" },
            ].map((p) => (
              <li key={p.name} className="sf-row sf-row--well">
                <span className="sf-avatar sf-avatar--sm">{p.name[0]}</span>
                <span className="sf-row__main">
                  <span className="sf-row__title">{p.name}</span>
                  <span className="sf-row__meta">PIN ••••</span>
                </span>
                <span className="sf-tag">{p.role}</span>
              </li>
            ))}
          </ul>
        </Visual>
      </Tile>

      <Tile
        className="mk-tile--design"
        icon={<PaletteIcon />}
        title="Cards that look like you."
        text="Your colours, your logo or artwork, your reward. Try a colour."
      >
        {/* The one live visual: its swatches are real buttons, so it stays visible to assistive tech. */}
        <Visual live>
          <CardDesigner />
        </Visual>
      </Tile>

      <Tile
        className="mk-tile--fraud"
        icon={<ShieldIcon />}
        title="No stamping yourself."
        text="Your counter QR only adds the card. Stamps need a staff scan, and each reward redeems once."
      >
        <Visual className="mk-rules">
          <p className="mk-rule">
            <span className="sf-bubble sf-bubble--sm sf-bubble--primary">
              <CheckIcon />
            </span>
            Counter QR → adds the card
          </p>
          <p className="mk-rule">
            <span className="sf-bubble sf-bubble--sm sf-bubble--primary">
              <CheckIcon />
            </span>
            Staff scan → adds a stamp
          </p>
          <p className="mk-rule mk-rule--no">
            <span className="sf-bubble sf-bubble--sm">
              <XIcon />
            </span>
            A reward, redeemed twice
          </p>
        </Visual>
      </Tile>
    </div>
  );
}

function Tile({ className, icon, title, text, children }: { className: string; icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <article className={`sf-card mk-tile ${className}`}>
      <div className="mk-tile__text">
        <div className="sf-card__head">
          <h3 className="sf-heading">{title}</h3>
          <span className="sf-bubble" aria-hidden>
            {icon}
          </span>
        </div>
        <p className="sf-body mk-muted">{text}</p>
      </div>
      {children}
    </article>
  );
}

/** A still of the product. Decorative unless `live` (something in it can be used). */
function Visual({ className = "", live, children }: { className?: string; live?: boolean; children: ReactNode }) {
  return (
    <div className={`mk-tile__visual ${className}`} aria-hidden={!live || undefined}>
      {children}
    </div>
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
