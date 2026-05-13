"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createGame, GameStateKind,
  CharCustom, DEFAULT_CUSTOM,
  HAIR_PRESETS, DRESS_PRESETS, PANTS_PRESETS,
  drawPreviewChar,
} from "@/lib/game";

type LevelId = 1 | 2 | 3 | 4;

export default function Game() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef<ReturnType<typeof createGame> | null>(null);

  const [levelId,  setLevelId]  = useState<LevelId | null>(null);
  const [custom,   setCustom]   = useState<CharCustom>(DEFAULT_CUSTOM);
  const [state,    setState]    = useState<GameStateKind>("start");
  const [score,    setScore]    = useState(0);
  const [progress, setProgress] = useState(0);
  const [winData,  setWinData]  = useState<{ score: number; tries: number } | null>(null);
  const [tapHint,  setTapHint]  = useState(false);

  useEffect(() => {
    if (!levelId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setState("start"); setScore(0); setProgress(0); setWinData(null);
    const ctrl = createGame(canvas, {
      onStateChange: (s, data) => {
        setState(s);
        if (s === "play") { setTapHint(true); setTimeout(() => setTapHint(false), 3000); }
        if (s === "win" && data) setWinData({ score: data.score ?? 0, tries: data.tries ?? 1 });
      },
      onProgress: pct => setProgress(pct),
      onScore:    n   => setScore(n),
    }, levelId, custom);
    controlRef.current = ctrl;
    return () => ctrl.destroy();
  }, [levelId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: custom intentionally excluded — we only apply it when starting a new game

  const pressJump   = useCallback(() => controlRef.current?.pressJump(),   []);
  const releaseJump = useCallback(() => controlRef.current?.releaseJump(), []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const down = (e: PointerEvent) => { e.preventDefault(); controlRef.current?.pointerDown(e.clientX, e.clientY); };
    const up   = (e: PointerEvent) => { e.preventDefault(); controlRef.current?.pointerUp(e.clientX, e.clientY); };
    el.addEventListener("pointerdown",   down, { passive: false });
    el.addEventListener("pointerup",     up,   { passive: false });
    el.addEventListener("pointercancel", up,   { passive: false });
    return () => {
      el.removeEventListener("pointerdown",   down);
      el.removeEventListener("pointerup",     up);
      el.removeEventListener("pointercancel", up);
    };
  }, []); // pointerDown/Up stable refs via controlRef

  useEffect(() => {
    const W2 = window.innerWidth / 2;
    const kd = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); pressJump(); }
      if (e.code === "ArrowLeft")  { e.preventDefault(); controlRef.current?.pointerDown(W2 - 1, 1); }
      if (e.code === "ArrowRight") { e.preventDefault(); controlRef.current?.pointerDown(W2 + 1, 1); }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") releaseJump();
      if (e.code === "ArrowLeft")  controlRef.current?.pointerUp(W2 - 1, 1);
      if (e.code === "ArrowRight") controlRef.current?.pointerUp(W2 + 1, 1);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup",   ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [pressJump, releaseJump]);

  const isPlaying = state === "play" || state === "stage";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0d12", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100vw", height: "100vh", cursor: "pointer",
          touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
          visibility: levelId ? "visible" : "hidden" }}
      />

      {isPlaying && levelId && (
        <div style={{ position: "fixed", top: 18, left: 18, right: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", pointerEvents: "none", zIndex: 5 }}>
          <HudCard label="Strålkastare" value={String(score)} />
          <HudCard label="Till scenen" progress={progress} />
        </div>
      )}

      {tapHint && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", background: "rgba(20,14,26,0.4)", padding: "8px 16px", borderRadius: 99, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", pointerEvents: "none", zIndex: 3 }}>
          Tryck eller mellanslag för att hoppa · håll för högre hopp
        </div>
      )}

      {/* ── Level selection ── */}
      <Overlay show={levelId === null}>
        <div style={{ maxWidth: 680, width: "100%", padding: "0 12px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b14a78", marginBottom: 8 }}>Välj bana</div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontWeight: 900, fontStyle: "italic", fontSize: "clamp(36px,6vw,64px)", lineHeight: 0.92, margin: "0 0 0", color: "#f7efe2" }}>Miss Jump</h1>
          </div>

          {/* Character customiser */}
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: "16px 20px", marginBottom: 18, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <CharacterPreview custom={custom} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <PickerRow label="Hår">
                {HAIR_PRESETS.map(p => (
                  <Swatch
                    key={p.key}
                    color={p.swatch}
                    label={p.label}
                    active={custom.hair === p.hair}
                    onClick={() => setCustom(c => ({ ...c, hair: p.hair, hairMid: p.hairMid, hairHi: p.hairHi }))}
                  />
                ))}
              </PickerRow>
              <PickerRow label="Längd">
                <LengthToggle
                  active={custom.hairLength === 'short'}
                  onClick={() => setCustom(c => ({ ...c, hairLength: 'short' }))}
                >Kort</LengthToggle>
                <LengthToggle
                  active={custom.hairLength === 'long'}
                  onClick={() => setCustom(c => ({ ...c, hairLength: 'long' }))}
                >Långt</LengthToggle>
              </PickerRow>
              <PickerRow label="Outfit">
                <LengthToggle active={custom.outfit === 'dress'} onClick={() => setCustom(c => ({ ...c, outfit: 'dress' }))}>Klänning</LengthToggle>
                <LengthToggle active={custom.outfit === 'top'}   onClick={() => setCustom(c => ({ ...c, outfit: 'top'   }))}>Topp</LengthToggle>
              </PickerRow>
              <PickerRow label={custom.outfit === 'top' ? 'Topp' : 'Klänning'}>
                {DRESS_PRESETS.map(p => (
                  <Swatch key={p.key} color={p.swatch} label={p.label}
                    active={custom.dress === p.dress}
                    onClick={() => setCustom(c => ({ ...c, dress: p.dress, dressTrim: p.dressTrim, dressAccent: p.dressAccent }))}
                  />
                ))}
              </PickerRow>
              {custom.outfit === 'top' && (
                <PickerRow label="Byxor">
                  {PANTS_PRESETS.map(p => (
                    <Swatch key={p.key} color={p.swatch} label={p.label}
                      active={custom.pantsColor === p.color}
                      onClick={() => setCustom(c => ({ ...c, pantsColor: p.color }))}
                    />
                  ))}
                </PickerRow>
              )}
            </div>
          </div>

          {/* Level cards — 2×2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 560 }}>
            <LevelCard num={1} title="Skogsturné" description="Spring på mossiga plattor, hoppa över taggar och avgrunder." difficulty={2} mechanic="🏃 Hoppa"
              palette={{ bg: "linear-gradient(150deg,#1e2e14,#101e0e)", accent: "#85b84a", dot: "#a0c862", badge: "#3a6020" }}
              onClick={() => setLevelId(1)} />
            <LevelCard num={2} title="Molnturné" description="Klättra på rosa moln och undvik blixtar högt uppe i skyn." difficulty={3} mechanic="☁️ Hoppa"
              palette={{ bg: "linear-gradient(150deg,#5a2050,#3a1038)", accent: "#ff9ec0", dot: "#ffd86b", badge: "#a04070" }}
              onClick={() => setLevelId(2)} />
            <LevelCard num={3} title="Miss Flappy" description="Tryck för att flyga uppåt, passera genom gluggar i molnen." difficulty={2} mechanic="🪶 Tryck = flyg"
              palette={{ bg: "linear-gradient(150deg,#204860,#102030)", accent: "#ffc5d2", dot: "#fff6fa", badge: "#904060" }}
              onClick={() => setLevelId(3)} />
            <LevelCard num={4} title="Fritt Fall" description="Faller nedåt — tryck vänster/höger sida för att svänga." difficulty={4} mechanic="↙↘ Sväng"
              palette={{ bg: "linear-gradient(150deg,#0a1030,#050818)", accent: "#b8d0f0", dot: "#ffd9e6", badge: "#204080" }}
              onClick={() => setLevelId(4)} />
          </div>
        </div>
      </Overlay>

      {/* ── In-game start ── */}
      <Overlay show={!!levelId && state === "start"}>
        <TitleCard>
          <Eyebrow>{["", "Skogsturné · Akt 1","Molnturné · Akt 2","Miss Flappy · Akt 3","Fritt Fall · Akt 4"][levelId!]}</Eyebrow>
          <BigTitle>Miss Jump</BigTitle>
          <Subtitle>{levelId === 1
            ? "Hoppa över taggar och avgrunder. Nå scenen vid vattenfallet."
            : levelId === 2
            ? "Hoppa mellan rosa moln. Akta blixtarna. Nå scenen bland stjärnorna."
            : levelId === 3
            ? "Tryck för att flyga uppåt. Passa genom gluggar i molnen. Nå scenen i skyn."
            : "Du faller! Tryck vänster eller höger halva av skärmen för att svänga. Navigera ned till scenen."
          }</Subtitle>
          <Cta onClick={pressJump}>Starta showen <Key>SPACE</Key></Cta>
          <BackLink onClick={() => setLevelId(null)}>← Byt bana</BackLink>
        </TitleCard>
      </Overlay>

      {/* ── Lose ── */}
      <Overlay show={!!levelId && state === "lose"} onClick={pressJump}>
        <TitleCard>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🎤</div>
          <Eyebrow>Tappade taktkänslan</Eyebrow>
          <BigTitle style={{ fontSize: "clamp(36px,5vw,60px)" }}>Tagning två?</BigTitle>
          <Subtitle>Publiken väntar fortfarande. Ta sats igen.</Subtitle>
          <Cta onClick={pressJump}>Försök igen <Key>SPACE</Key></Cta>
          <BackLink onClick={() => setLevelId(null)}>← Byt bana</BackLink>
        </TitleCard>
      </Overlay>

      {/* ── Win ── */}
      <Overlay show={!!levelId && state === "win"}>
        <TitleCard>
          <Eyebrow>Encore</Eyebrow>
          <BigTitle>Scenen är din.</BigTitle>
          <Subtitle>Strålkastaren tänds. Publiken håller andan.</Subtitle>
          {winData && (
            <div style={{ display: "flex", gap: 28, justifyContent: "center", margin: "18px 0 4px" }}>
              <Stat label="Strålkastare" value={String(winData.score)} />
              <Stat label="Försök" value={String(winData.tries)} />
            </div>
          )}
          <Cta onClick={pressJump} style={{ marginTop: 18 }}>Spela igen <Key>SPACE</Key></Cta>
          <BackLink onClick={() => setLevelId(null)}>← Byt bana / Anpassa</BackLink>
        </TitleCard>
      </Overlay>
    </div>
  );
}

// ── Character preview canvas ─────────────────────────────────────────────────

function CharacterPreview({ custom }: { custom: CharCustom }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Use logical (CSS-pixel) dimensions — DPR scaling handled inside the effect
  const W = 110, H = 175;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Measure DPR at runtime so we always get the correct device value
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Soft glow background
    const bg = ctx.createRadialGradient(W/2, H * 0.55, 6, W/2, H * 0.55, W * 0.75);
    bg.addColorStop(0, "rgba(255,240,255,0.14)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // Ground shadow under feet
    ctx.fillStyle = "rgba(80,40,80,0.18)";
    ctx.beginPath(); ctx.ellipse(W/2, H - 10, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Character — cy = H-10 gives plenty of room above for hair
    drawPreviewChar(ctx, W / 2, H - 10, custom);
  }, [custom]); // DPR is read inside the effect so no need in deps

  // Render initial canvas at W×H; the effect will resize it correctly
  return <canvas ref={ref} width={W} height={H} style={{ flexShrink: 0, display: "block" }} />;
}

// ── Customisation UI pieces ──────────────────────────────────────────────────

function PickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function LengthToggle({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600,
        border: active ? "2px solid #fff" : "2px solid rgba(255,255,255,0.22)",
        background: active ? "rgba(255,255,255,0.18)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.55)",
        cursor: "pointer", letterSpacing: "0.04em",
        transition: "all 0.12s",
        outline: "none",
      }}
    >
      {children}
    </button>
  );
}

function Swatch({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 28, height: 28, borderRadius: "50%",
        background: color,
        border: active ? "2.5px solid #fff" : "2px solid rgba(255,255,255,0.18)",
        boxShadow: active ? `0 0 0 1.5px ${color}, 0 0 8px ${color}88` : "none",
        cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s",
        transform: active ? "scale(1.18)" : "scale(1)",
        outline: "none",
      }}
    />
  );
}

// ── Level card ───────────────────────────────────────────────────────────────

function LevelCard({ num, title, description, difficulty, mechanic, palette, onClick }: {
  num: number; title: string; description: string; difficulty: number; mechanic: string;
  palette: { bg: string; accent: string; dot: string; badge: string };
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      background: palette.bg, border: `1.5px solid ${palette.accent}55`,
      borderRadius: 16, padding: "18px 16px 16px", cursor: "pointer",
      textAlign: "left", color: "#f5efe6",
      boxShadow: "0 10px 32px rgba(0,0,0,0.45)", outline: "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ background: palette.badge, color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99 }}>Bana {num}</span>
        <span style={{ fontSize: 11, letterSpacing: 1.5 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ color: i < difficulty ? palette.dot : "rgba(255,255,255,0.18)" }}>★</span>)}
        </span>
      </div>
      <div style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontStyle: "italic", fontSize: 19, lineHeight: 1.1, marginBottom: 6, color: "#fff" }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(245,239,230,0.65)", marginBottom: 10 }}>{description}</div>
      <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700 }}>{mechanic} &nbsp;→</div>
    </button>
  );
}

// ── Shared overlays ──────────────────────────────────────────────────────────

function Overlay({ show, children, onClick }: { show: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, rgba(20,14,26,0.55) 0%, rgba(8,6,12,0.78) 100%)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      zIndex: 10, textAlign: "center", padding: 16,
      opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none",
      transition: "opacity 0.35s ease",
    }}>
      {children}
    </div>
  );
}

function TitleCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 520, padding: "32px 36px 28px", background: "linear-gradient(180deg,rgba(255,240,222,0.96),rgba(255,224,218,0.92))", borderRadius: 24, border: "1px solid rgba(255,255,255,0.6)", boxShadow: "0 28px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.8)", color: "#2a1a30" }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b14a78", marginBottom: 8 }}>{children}</div>;
}

function BigTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <h1 style={{ fontFamily: '"Playfair Display","Times New Roman",serif', fontWeight: 900, fontStyle: "italic", fontSize: "clamp(46px,7vw,80px)", lineHeight: 0.92, margin: "0 0 8px", letterSpacing: "-0.02em", color: "#1f0e26", ...style }}>{children}</h1>;
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, lineHeight: 1.5, color: "#4a2c4a", opacity: 0.85, margin: "0 auto 20px", maxWidth: 360 }}>{children}</p>;
}

function Cta({ children, onClick, style }: { children: React.ReactNode; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#1f0e26", color: "#fff5e8", padding: "13px 24px", borderRadius: 99, fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", border: "none", cursor: "pointer", boxShadow: "0 10px 24px rgba(31,14,38,0.4)", ...style }}>
      {children}
    </button>
  );
}

function BackLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={onClick} style={{ background: "none", border: "none", color: "#9060c0", fontSize: 12, cursor: "pointer", opacity: 0.8, letterSpacing: "0.04em" }}>{children}</button>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ background: "rgba(255,255,255,0.18)", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontFamily: "ui-monospace,monospace", border: "1px solid rgba(255,255,255,0.2)" }}>{children}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#1f0e26" }}>{value}</div>
    </div>
  );
}

function HudCard({ label, value, progress }: { label: string; value?: string; progress?: number }) {
  return (
    <div style={{ background: "rgba(20,14,26,0.55)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "10px 16px", color: "#f7efe2", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", textAlign: progress !== undefined ? "right" : "left" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6, marginBottom: 2, fontWeight: 600 }}>{label}</div>
      {value !== undefined && <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>{value}</div>}
      {progress !== undefined && (
        <div style={{ width: 200, height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
          <div style={{ height: "100%", width: `${(progress*100).toFixed(1)}%`, background: "linear-gradient(90deg,#ffb86b 0%,#ff6f9c 50%,#c46cff 100%)", borderRadius: 99, transition: "width 0.12s linear" }} />
        </div>
      )}
    </div>
  );
}
