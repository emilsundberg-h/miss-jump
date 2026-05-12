"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createGame, GameStateKind } from "@/lib/game";

type LevelId = 1 | 2;

export default function Game() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef<ReturnType<typeof createGame> | null>(null);

  const [levelId,  setLevelId]  = useState<LevelId | null>(null); // null = selection screen
  const [state,    setState]    = useState<GameStateKind>("start");
  const [score,    setScore]    = useState(0);
  const [progress, setProgress] = useState(0);
  const [winData,  setWinData]  = useState<{ score: number; tries: number } | null>(null);
  const [tapHint,  setTapHint]  = useState(false);

  // Create (or recreate) game whenever a level is chosen
  useEffect(() => {
    if (!levelId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setState("start");
    setScore(0); setProgress(0); setWinData(null);
    const ctrl = createGame(canvas, {
      onStateChange: (s, data) => {
        setState(s);
        if (s === "play") {
          setTapHint(true);
          setTimeout(() => setTapHint(false), 3000);
        }
        if (s === "win" && data) {
          setWinData({ score: data.score ?? 0, tries: data.tries ?? 1 });
        }
      },
      onProgress: pct => setProgress(pct),
      onScore:    n   => setScore(n),
    }, levelId);
    controlRef.current = ctrl;
    return () => ctrl.destroy();
  }, [levelId]);

  const pressJump   = useCallback(() => controlRef.current?.pressJump(),   []);
  const releaseJump = useCallback(() => controlRef.current?.releaseJump(), []);

  // Pointer events on canvas
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const down = (e: PointerEvent) => { e.preventDefault(); pressJump(); };
    const up   = (e: PointerEvent) => { e.preventDefault(); releaseJump(); };
    el.addEventListener("pointerdown",   down,   { passive: false });
    el.addEventListener("pointerup",     up,     { passive: false });
    el.addEventListener("pointercancel", up,     { passive: false });
    return () => {
      el.removeEventListener("pointerdown",   down);
      el.removeEventListener("pointerup",     up);
      el.removeEventListener("pointercancel", up);
    };
  }, [pressJump, releaseJump]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault(); pressJump();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") releaseJump();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [pressJump, releaseJump]);

  const isPlaying = state === "play" || state === "stage";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0d12", overflow: "hidden" }}>
      {/* Canvas fills viewport — always mounted so it's ready */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block", width: "100vw", height: "100vh",
          cursor: "pointer", touchAction: "none",
          userSelect: "none", WebkitUserSelect: "none",
          visibility: levelId ? "visible" : "hidden",
        }}
      />

      {/* HUD */}
      {isPlaying && levelId && (
        <div style={{ position: "fixed", top: 18, left: 18, right: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-start", pointerEvents: "none", zIndex: 5 }}>
          <HudCard label="Strålkastare" value={String(score)} />
          <HudCard label="Till scenen" progress={progress} />
        </div>
      )}

      {/* Tap hint */}
      {tapHint && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
          background: "rgba(20,14,26,0.4)", padding: "8px 16px", borderRadius: 99,
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", pointerEvents: "none", zIndex: 3,
        }}>
          Tryck eller mellanslag för att hoppa · håll för högre hopp
        </div>
      )}

      {/* ── Level selection ── */}
      <Overlay show={levelId === null}>
        <div style={{ maxWidth: 600, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b14a78", marginBottom: 10 }}>Välj bana</div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontWeight: 900, fontStyle: "italic", fontSize: "clamp(38px, 6vw, 68px)", lineHeight: 0.92, margin: "0 0 6px", color: "#f7efe2" }}>Miss Jump</h1>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            <LevelCard
              num={1}
              title="Skogsturné"
              description="Mossiga stensplattor, vattenfall, taggar av ben. Nå scenen djupt inne i skogen."
              difficulty={2}
              palette={{ bg: "linear-gradient(160deg,#2a3820,#1a2818)", accent: "#85b84a", dot: "#a0c862", badge: "#4f7e2e" }}
              onClick={() => setLevelId(1)}
            />
            <LevelCard
              num={2}
              title="Molnturné"
              description="Fluffiga moln på himlen, blixtar som hinder. Klättra upp mot konsertscenen bland stjärnorna."
              difficulty={3}
              palette={{ bg: "linear-gradient(160deg,#1a3060,#0e1c40)", accent: "#72b8e8", dot: "#f4d820", badge: "#2c6ba8" }}
              onClick={() => setLevelId(2)}
            />
          </div>
        </div>
      </Overlay>

      {/* ── In-game start ── */}
      <Overlay show={!!levelId && state === "start"}>
        <TitleCard>
          <Eyebrow>{levelId === 1 ? "Skogsturné · Akt 1" : "Molnturné · Akt 2"}</Eyebrow>
          <BigTitle>Miss Jump</BigTitle>
          <Subtitle>{levelId === 1
            ? "Hoppa över taggar och avgrunder genom den mossiga skogen. Nå scenen vid vattenfallet."
            : "Hoppa mellan molnen i höjd med solen. Akta blixtarna. Nå scenen bland molnen."
          }</Subtitle>
          <Cta onClick={pressJump}>Starta showen <Key>SPACE</Key></Cta>
          <BackLink onClick={() => setLevelId(null)}>← Byt bana</BackLink>
        </TitleCard>
      </Overlay>

      {/* ── Lose ── */}
      <Overlay show={!!levelId && state === "lose"}>
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
              <Stat label="Försök"       value={String(winData.tries)} />
            </div>
          )}
          <Cta onClick={pressJump} style={{ marginTop: 18 }}>Spela igen <Key>SPACE</Key></Cta>
          <BackLink onClick={() => setLevelId(null)}>← Byt bana</BackLink>
        </TitleCard>
      </Overlay>
    </div>
  );
}

// ── Level selection card ────────────────────────────────────────────────────

function LevelCard({ num, title, description, difficulty, palette, onClick }: {
  num: number; title: string; description: string; difficulty: number;
  palette: { bg: string; accent: string; dot: string; badge: string };
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      flex: "1 1 240px", maxWidth: 270,
      background: palette.bg, border: `1.5px solid ${palette.accent}44`,
      borderRadius: 20, padding: "28px 24px 24px", cursor: "pointer",
      textAlign: "left", color: "#f5efe6", transition: "transform 0.15s, box-shadow 0.15s",
      boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 20px 50px rgba(0,0,0,0.5)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 40px rgba(0,0,0,0.4)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ background: palette.badge, color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 99 }}>
          Bana {num}
        </span>
        <span style={{ fontSize: 13, letterSpacing: 2 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} style={{ color: i < difficulty ? palette.dot : "rgba(255,255,255,0.2)" }}>★</span>
          ))}
        </span>
      </div>
      <div style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontStyle: "italic", fontSize: 26, lineHeight: 1.1, marginBottom: 10, color: "#fff" }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(245,239,230,0.72)" }}>{description}</div>
      <div style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 6, color: palette.accent, fontSize: 13, fontWeight: 600 }}>
        Starta <span style={{ fontSize: 16 }}>→</span>
      </div>
    </button>
  );
}

// ── Shared overlay components ───────────────────────────────────────────────

function Overlay({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, rgba(20,14,26,0.55) 0%, rgba(8,6,12,0.78) 100%)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      zIndex: 10, textAlign: "center", padding: 20,
      opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none",
      transition: "opacity 0.35s ease",
    }}>
      {children}
    </div>
  );
}

function TitleCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      maxWidth: 540, padding: "36px 40px 32px",
      background: "linear-gradient(180deg, rgba(255,240,222,0.96), rgba(255,224,218,0.92))",
      borderRadius: 26, border: "1px solid rgba(255,255,255,0.6)",
      boxShadow: "0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.8)",
      color: "#2a1a30",
    }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b14a78", marginBottom: 10 }}>{children}</div>;
}

function BigTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h1 style={{ fontFamily: '"Playfair Display", "Times New Roman", serif', fontWeight: 900, fontStyle: "italic", fontSize: "clamp(48px, 7vw, 84px)", lineHeight: 0.92, margin: "0 0 8px", letterSpacing: "-0.02em", color: "#1f0e26", ...style }}>
      {children}
    </h1>
  );
}

function Subtitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, lineHeight: 1.5, color: "#4a2c4a", opacity: 0.85, margin: "0 auto 22px", maxWidth: 380 }}>{children}</p>;
}

function Cta({ children, onClick, style }: { children: React.ReactNode; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#1f0e26", color: "#fff5e8", padding: "14px 26px", borderRadius: 99, fontWeight: 700, fontSize: 15, letterSpacing: "0.04em", border: "none", cursor: "pointer", boxShadow: "0 10px 24px rgba(31,14,38,0.4)", ...style }}>
      {children}
    </button>
  );
}

function BackLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={onClick} style={{ background: "none", border: "none", color: "#9060c0", fontSize: 13, cursor: "pointer", opacity: 0.8, letterSpacing: "0.04em" }}>
        {children}
      </button>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <span style={{ background: "rgba(255,255,255,0.18)", padding: "3px 9px", borderRadius: 6, fontSize: 12, fontFamily: "ui-monospace, monospace", border: "1px solid rgba(255,255,255,0.2)" }}>{children}</span>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 16, fontSize: 12, color: "#6b4a6b", opacity: 0.7, letterSpacing: "0.08em", textTransform: "uppercase" }}>{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "#1f0e26" }}>{value}</div>
    </div>
  );
}

function HudCard({ label, value, progress }: { label: string; value?: string; progress?: number }) {
  return (
    <div style={{ background: "rgba(20,14,26,0.55)", backdropFilter: "blur(12px) saturate(1.2)", WebkitBackdropFilter: "blur(12px) saturate(1.2)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "10px 16px", color: "#f7efe2", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", textAlign: progress !== undefined ? "right" : "left" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6, marginBottom: 2, fontWeight: 600 }}>{label}</div>
      {value !== undefined && <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>{value}</div>}
      {progress !== undefined && (
        <div style={{ width: 220, height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
          <div style={{ height: "100%", width: `${(progress * 100).toFixed(1)}%`, background: "linear-gradient(90deg, #ffb86b 0%, #ff6f9c 50%, #c46cff 100%)", borderRadius: 99, transition: "width 0.12s linear" }} />
        </div>
      )}
    </div>
  );
}
