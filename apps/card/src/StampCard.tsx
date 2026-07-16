import type { CSSProperties } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { CardView } from "./api";

export function StampCard({
  card,
  busy,
  err,
  onStamp,
  onRedeem,
}: {
  card: CardView;
  busy: boolean;
  err: string | null;
  onStamp: () => void;
  onRedeem: () => void;
}) {
  const total = card.stampsRequired;
  const cells = Array.from({ length: total }, (_, i) => i < card.currentStamps);
  const remaining = Math.max(0, total - card.currentStamps);

  return (
    <div className="screen card-screen">
      <div className={`stampcard${card.rewardReady ? " ready" : ""}`}>
        <div className="sc-top">
          <div className="sc-logo">{card.merchantName.charAt(0)}</div>
          <div className="sc-id">
            <div className="sc-name">{card.merchantName}</div>
            <div className="sc-sub">{card.programName}</div>
          </div>
          <div className="sc-count">
            {card.currentStamps}
            <span>/{total}</span>
          </div>
        </div>

        <div className="stamp-grid" style={{ "--cols": Math.min(total, 5) } as CSSProperties}>
          {cells.map((on, i) => (
            <span
              key={i}
              className={`stamp${on ? " on" : ""}`}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              {on ? "☕" : ""}
            </span>
          ))}
        </div>

        <div className="sc-foot">
          <span className="sc-reward">
            {card.rewardReady ? "🎉 Reward ready!" : `${remaining} to your reward`}
          </span>
          <span className="sc-pill">{card.rewardText}</span>
        </div>

        <div className="sc-qr">
          <div className="sc-qr-box">
            <QRCodeSVG value={card.serial} size={116} bgColor="transparent" fgColor="#ffffff" />
          </div>
          <div className="sc-qr-cap">Show this to staff to earn a stamp</div>
        </div>
      </div>

      <div className="wallet-row">
        <button className="wallet-btn apple" disabled title="Wallet integration wires in later">
           Add to Apple Wallet
        </button>
        <button className="wallet-btn google" disabled title="Wallet integration wires in later">
          Add to Google Wallet
        </button>
      </div>
      <p className="wallet-note">
        Wallet buttons light up when a provider (Google / PassKit) is connected.
      </p>

      <div className="dev-row">
        <span className="dev-label">DEV</span>
        <button onClick={onStamp} disabled={busy}>
          + Simulate stamp
        </button>
        <button className="ghost" onClick={onRedeem} disabled={busy || !card.rewardReady}>
          Redeem
        </button>
      </div>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
