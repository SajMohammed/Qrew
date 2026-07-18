import { useEffect, useState, type CSSProperties } from "react";
import { getProgram, updateProgram, type Program } from "./api";

const PRESET_COLORS = [
  "#146A2E", "#0C2712", "#6C2A4B", "#1F5673",
  "#8A4B2F", "#3B2E5A", "#B0413E", "#2E7D57",
];
const STAMP_ICONS = ["☕", "✦", "★", "♥", "🍩", "🥐", "🍕", "🌮", "🍺", "💇", "🛍️", "🎁"];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#fbfbf7";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1c1a15" : "#fbfbf7";
}

export function Designer({ merchantId, merchantName }: { merchantId: string; merchantName?: string }) {
  const [program, setProgram] = useState<Program | null>(null);
  const [name, setName] = useState("");
  const [rewardText, setRewardText] = useState("");
  const [stampsRequired, setStampsRequired] = useState(10);
  const [bonusStamps, setBonusStamps] = useState(2);
  const [brandColor, setBrandColor] = useState("#146A2E");
  const [stampIcon, setStampIcon] = useState("☕");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getProgram(merchantId)
      .then((p) => {
        setProgram(p);
        setName(p.name);
        setRewardText(p.rewardText);
        setStampsRequired(p.stampsRequired);
        setBonusStamps(p.bonusStamps);
        setBrandColor(p.cardDesign.brandColor);
        setStampIcon(p.cardDesign.stampIcon);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [merchantId]);

  async function save() {
    if (!program) return;
    setStatus("saving");
    setErr(null);
    try {
      const updated = await updateProgram(merchantId, program.id, {
        name,
        rewardText,
        stampsRequired,
        bonusStamps,
        cardDesign: { brandColor, stampIcon },
      });
      setProgram(updated);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }

  if (!program) return <p className="muted">{err ?? "Loading…"}</p>;

  return (
    <div className="designer">
      <div className="controls">
        <label>
          Program name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <label>
          Reward
          <input value={rewardText} onChange={(e) => setRewardText(e.target.value)} maxLength={60} />
        </label>
        <div className="two">
          <label>
            Stamps to reward
            <input
              type="number"
              min={1}
              max={20}
              value={stampsRequired}
              onChange={(e) => setStampsRequired(clamp(+e.target.value, 1, 20))}
            />
          </label>
          <label>
            Bonus on signup
            <input
              type="number"
              min={0}
              max={10}
              value={bonusStamps}
              onChange={(e) => setBonusStamps(clamp(+e.target.value, 0, 10))}
            />
          </label>
        </div>

        <div className="field">
          <div className="flabel">Brand colour</div>
          <div className="swatches">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`sw${c.toLowerCase() === brandColor.toLowerCase() ? " on" : ""}`}
                style={{ background: c }}
                onClick={() => setBrandColor(c)}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              className="colorpick"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              aria-label="custom colour"
            />
          </div>
        </div>

        <div className="field">
          <div className="flabel">Stamp icon</div>
          <div className="icons">
            {STAMP_ICONS.map((i) => (
              <button key={i} className={`ic${i === stampIcon ? " on" : ""}`} onClick={() => setStampIcon(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="saverow">
          <button className="primary" onClick={save} disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : "Save card"}
          </button>
          <span className="hint">Customers see changes on their next card refresh.</span>
        </div>
        {err && <p className="err">{err}</p>}
      </div>

      <div className="preview">
        <PreviewCard
          merchantName={merchantName || program.name}
          brandColor={brandColor}
          stampIcon={stampIcon}
          rewardText={rewardText}
          stampsRequired={stampsRequired}
          filled={Math.min(stampsRequired, bonusStamps + 3)}
        />
        <div className="preview-cap">Live preview</div>
      </div>
    </div>
  );
}

function PreviewCard({
  merchantName,
  brandColor,
  stampIcon,
  rewardText,
  stampsRequired,
  filled,
}: {
  merchantName: string;
  brandColor: string;
  stampIcon: string;
  rewardText: string;
  stampsRequired: number;
  filled: number;
}) {
  const cells = Array.from({ length: stampsRequired }, (_, i) => i < filled);
  const style = {
    "--c": brandColor,
    "--ci": textOn(brandColor),
    "--cols": Math.min(stampsRequired, 5),
  } as CSSProperties;
  return (
    <div className="pcard" style={style}>
      <div className="pc-top">
        <div className="pc-logo">{(merchantName || "Q").charAt(0)}</div>
        <div className="pc-name">{merchantName || "Your shop"}</div>
      </div>
      <div className="pc-grid">
        {cells.map((on, i) => (
          <span key={i} className={`pc-stamp${on ? " on" : ""}`}>
            {on ? stampIcon : ""}
          </span>
        ))}
      </div>
      <div className="pc-foot">
        {filled}/{stampsRequired} · {rewardText || "reward"}
      </div>
    </div>
  );
}
