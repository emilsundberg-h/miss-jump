"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createGame, GameStateKind,
  CharCustom, DEFAULT_CUSTOM,
  HAIR_PRESETS, DRESS_PRESETS, PANTS_PRESETS, SKIN_PRESETS,
  drawPreviewChar,
} from "@/lib/game";

type LevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Volume targets per game state
const VOL = { menu: 0.07 as number, play: 0.7 as number, dead: 0.07 as number };

function useMusic() {
  const audio  = useRef<HTMLAudioElement | null>(null);
  const target = useRef(VOL.menu);
  const timer  = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopFade = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const setVol = useCallback((v: number) => {
    target.current = v;
    const a = audio.current;
    if (!a) return;
    stopFade();
    // 100 ms interval (10 fps) — plenty smooth for audio, no RAF pressure on game loop
    timer.current = setInterval(() => {
      const diff = target.current - a.volume;
      if (Math.abs(diff) < 0.01) { a.volume = target.current; stopFade(); return; }
      a.volume = Math.max(0, Math.min(1, a.volume + diff * 0.18));
    }, 100);
  }, []);

  const muted = useRef(false);

  const toggleMute = useCallback(() => {
    muted.current = !muted.current;
    const a = audio.current;
    if (a) a.muted = muted.current;
    return muted.current;
  }, []);

  const start = useCallback(() => {
    if (audio.current) return;
    const a = new Audio("/bg-music.mp3");
    a.loop = true;
    a.volume = 0;
    a.muted = muted.current;
    a.play().catch(() => {});
    audio.current = a;
    setVol(VOL.menu);
  }, [setVol]);

  useEffect(() => {
    const onVisibility = () => {
      const a = audio.current;
      if (!a) return;
      if (document.hidden) { a.pause(); }
      else { a.play().catch(() => {}); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopFade();
      audio.current?.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { start, setVol, toggleMute };
}

export default function Game() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const controlRef = useRef<ReturnType<typeof createGame> | null>(null);
  const music      = useMusic();

  const [levelId,  setLevelId]  = useState<LevelId | null>(null);
  const [custom,   setCustom]   = useState<CharCustom>(() => {
    try { const s = localStorage.getItem('mj_custom'); if (s) return { ...DEFAULT_CUSTOM, ...JSON.parse(s) }; } catch {}
    return DEFAULT_CUSTOM;
  });
  const [bests,    setBests]    = useState<Record<number, number>>(() => {
    try { const s = localStorage.getItem('mj_bests'); if (s) return JSON.parse(s); } catch {}
    return {};
  });
  const [state,    setState]    = useState<GameStateKind>("start");
  const [score,    setScore]    = useState(0);
  const [progress, setProgress] = useState(0);
  const [winData,  setWinData]  = useState<{ score: number; tries: number } | null>(null);
  const [tries,    setTries]    = useState(1);
  const [tapHint,  setTapHint]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [muted,    setMuted]    = useState(false);
  const [easy,     setEasy]     = useState(false);
  const [tiltOk,   setTiltOk]   = useState(() => { try { return localStorage.getItem('mj_tilt') === 'granted'; } catch { return false; } });
  const [useTilt,  setUseTilt]  = useState(false);

  // Device orientation → tilt (level 7, landscape-aware)
  useEffect(() => {
    if (!tiltOk || !useTilt) return;
    const handler = (e: DeviceOrientationEvent) => {
      // Compensate for landscape orientation: gamma is ~±90° when held horizontally,
      // so use beta (the axis that reflects left/right tilt in landscape).
      const angle = (typeof screen?.orientation?.angle !== 'undefined'
        ? screen.orientation.angle
        : (window as any).orientation ?? 0) as number;
      let tilt: number;
      if (angle === 90)              tilt = -(e.beta  ?? 0); // landscape: home right
      else if (angle === -90 || angle === 270) tilt =  (e.beta  ?? 0); // landscape: home left
      else                           tilt =  (e.gamma ?? 0); // portrait
      controlRef.current?.setTilt(tilt);
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [tiltOk, useTilt]);

  const requestTilt = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res === 'granted') { localStorage.setItem('mj_tilt','granted'); setTiltOk(true); }
      } catch {}
    } else {
      localStorage.setItem('mj_tilt','granted'); setTiltOk(true);
    }
  }, []);

  // Persist character customisation
  useEffect(() => {
    try { localStorage.setItem('mj_custom', JSON.stringify(custom)); } catch {}
  }, [custom]);

  // Adjust volume whenever game state changes
  useEffect(() => {
    if (state === "play" || state === "stage") music.setVol(VOL.play);
    else if (state === "lose")                 music.setVol(VOL.dead);
    else                                       music.setVol(VOL.menu);
  }, [state, music]);

  // Menu volume when back on level selection
  useEffect(() => {
    if (levelId === null) music.setVol(VOL.menu);
  }, [levelId, music]);

  useEffect(() => {
    if (!levelId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setState("start"); setScore(0); setProgress(0); setWinData(null); setTries(1);
    const ctrl = createGame(canvas, {
      onStateChange: (s, data) => {
        setState(s);
        if (s === "play") { setTapHint(true); setTimeout(() => setTapHint(false), 3000); }
        if (data?.tries) setTries(data.tries);
        if (s === "win" && data) {
          const t = data.tries ?? 1;
          setWinData({ score: data.score ?? 0, tries: t });
          setBests(prev => {
            if (!prev[levelId!] || t < prev[levelId!]) {
              const next = { ...prev, [levelId!]: t };
              try { localStorage.setItem('mj_bests', JSON.stringify(next)); } catch {}
              return next;
            }
            return prev;
          });
        }
      },
      onProgress: pct => setProgress(pct),
      onScore:    n   => setScore(n),
    }, levelId, custom, easy);
    controlRef.current = ctrl;
    return () => ctrl.destroy();
  }, [levelId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: custom intentionally excluded — we only apply it when starting a new game

  const pressJump   = useCallback(() => controlRef.current?.pressJump(),   []);
  const releaseJump = useCallback(() => controlRef.current?.releaseJump(), []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const down = (e: PointerEvent) => { e.preventDefault(); music.start(); controlRef.current?.pointerDown(e.clientX, e.clientY); };
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
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); music.start(); pressJump(); }
      if (e.code === "ArrowLeft")  { e.preventDefault(); controlRef.current?.pointerDown(W2 - 1, 1); }
      if (e.code === "ArrowRight") { e.preventDefault(); controlRef.current?.pointerDown(W2 + 1, 1); }
      if (e.code === "ArrowUp")    { e.preventDefault(); controlRef.current?.setTilt(-55); } // simulate tilting back
      if (e.code === "ArrowDown")  { e.preventDefault(); controlRef.current?.setTilt(20); }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") releaseJump();
      if (e.code === "ArrowLeft")  { controlRef.current?.pointerUp(W2 - 1, 1); }
      if (e.code === "ArrowRight") { controlRef.current?.pointerUp(W2 + 1, 1); }
      if (e.code === "ArrowUp" || e.code === "ArrowDown") controlRef.current?.setTilt(0);
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

      {/* ── Mute button — always visible ── */}
      <button
        onClick={() => setMuted(music.toggleMute())}
        style={{
          position: "fixed", top: 14, right: 14, zIndex: 20,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(20,14,26,0.55)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#f7efe2", fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {isPlaying && levelId && (
        <div style={{ position: "fixed", top: 18, left: 18, right: 62, display: "flex", justifyContent: "space-between", alignItems: "flex-start", pointerEvents: "none", zIndex: 5 }}>
          <HudCard label="Spotlight" value={String(score)} />
          <HudCard label="To the Stage" progress={progress} />
        </div>
      )}

      {tapHint && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", background: "rgba(20,14,26,0.4)", padding: "8px 16px", borderRadius: 99, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", pointerEvents: "none", zIndex: 3 }}>
          {levelId === 7 ? (useTilt ? "Luta vänster / höger för att styra" : "Tryck vänster · höger halva för att styra") : "Tap or press space to jump · hold for higher jump"}
        </div>
      )}

      {/* ── Level 5 virtual joystick ── */}
      {isPlaying && levelId === 5 && (
        <VirtualJoystick onMove={(dx, dy) => controlRef.current?.setJoystick(dx, dy)} />
      )}

      {/* ── Level selection ── */}
      <Overlay show={levelId === null} scrollable>
        <div style={{ maxWidth: 680, width: "100%", padding: "24px 12px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "#b14a78", marginBottom: 8 }}>Choose Level</div>
            <h1 style={{ fontFamily: '"Playfair Display", serif', fontWeight: 900, fontStyle: "italic", fontSize: "clamp(36px,6vw,64px)", lineHeight: 0.92, margin: "0 0 16px", color: "#f7efe2" }}>Miss Jump</h1>
            {/* Difficulty toggle */}
            <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.30)", borderRadius: 99, padding: 4, gap: 4 }}>
              <button onClick={() => setEasy(false)} style={{
                padding: "8px 22px", borderRadius: 99, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
                background: !easy ? "#f7efe2" : "transparent", color: !easy ? "#1f0e26" : "rgba(255,255,255,0.55)", transition: "all 0.18s",
              }}>Normal</button>
              <button onClick={() => setEasy(true)} style={{
                padding: "8px 22px", borderRadius: 99, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em",
                background: easy ? "#a6e84a" : "transparent", color: easy ? "#1f0e26" : "rgba(255,255,255,0.55)", transition: "all 0.18s",
              }}>Easy ⭐</button>
            </div>
            {easy && <div style={{ marginTop: 8, fontSize: 11, color: "rgba(166,232,74,0.85)", letterSpacing: "0.08em" }}>No spikes · Wider gaps · Slower speed</div>}
          </div>

          {/* Character customiser */}
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: "16px 20px", marginBottom: 18, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            <CharacterPreview custom={custom} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <PickerRow label="Hair">
                {HAIR_PRESETS.map(p => (
                  <Swatch key={p.key} color={p.swatch} label={p.label}
                    active={custom.hair === p.hair}
                    onClick={() => setCustom(c => ({ ...c, hair: p.hair, hairMid: p.hairMid, hairHi: p.hairHi }))}
                  />
                ))}
              </PickerRow>
              <PickerRow label="Length">
                <LengthToggle active={custom.hairLength === 'short'} onClick={() => setCustom(c => ({ ...c, hairLength: 'short' }))}>Short</LengthToggle>
                <LengthToggle active={custom.hairLength === 'long'}  onClick={() => setCustom(c => ({ ...c, hairLength: 'long'  }))}>Long</LengthToggle>
              </PickerRow>
              <PickerRow label="Skin">
                {SKIN_PRESETS.map(p => (
                  <Swatch key={p.key} color={p.swatch} label={p.label}
                    active={custom.skin === p.skin}
                    onClick={() => setCustom(c => ({ ...c, skin: p.skin }))}
                  />
                ))}
              </PickerRow>
              <PickerRow label="Outfit">
                <LengthToggle active={custom.outfit === 'dress'} onClick={() => setCustom(c => ({ ...c, outfit: 'dress' }))}>Dress</LengthToggle>
                <LengthToggle active={custom.outfit === 'top'}   onClick={() => setCustom(c => ({ ...c, outfit: 'top'   }))}>Top</LengthToggle>
              </PickerRow>
              <PickerRow label={custom.outfit === 'top' ? 'Top colour' : 'Dress colour'}>
                {DRESS_PRESETS.map(p => (
                  <Swatch key={p.key} color={p.swatch} label={p.label}
                    active={custom.dress === p.dress}
                    onClick={() => setCustom(c => ({ ...c, dress: p.dress, dressTrim: p.dressTrim, dressAccent: p.dressAccent }))}
                  />
                ))}
              </PickerRow>
              {custom.outfit === 'top' && (
                <PickerRow label="Pants">
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

          {/* Level cards — 2×3 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 560 }}>
            <LevelCard num={1} title="Forest Tour" description="Run on mossy platforms, jump over spikes and gaps." difficulty={2} mechanic="🏃 Jump"
              palette={{ bg: "linear-gradient(150deg,#1e2e14,#101e0e)", accent: "#85b84a", dot: "#a0c862", badge: "#3a6020" }}
              best={bests[1]} onClick={() => setLevelId(1)} />
            <LevelCard num={2} title="Cloud Tour" description="Jump between pink clouds, dodge grey spikes." difficulty={3} mechanic="☁️ Jump"
              palette={{ bg: "linear-gradient(150deg,#5a2050,#3a1038)", accent: "#ff9ec0", dot: "#ffd86b", badge: "#a04070" }}
              best={bests[2]} onClick={() => setLevelId(2)} />
            <LevelCard num={3} title="Miss Flappy" description="Tap to fly up and pass through cloud gaps." difficulty={2} mechanic="🪶 Tap = fly"
              palette={{ bg: "linear-gradient(150deg,#204860,#102030)", accent: "#ffc5d2", dot: "#fff6fa", badge: "#904060" }}
              best={bests[3]} onClick={() => setLevelId(3)} />
            <LevelCard num={4} title="Free Fall" description="Clouds end — steer left or right as you plummet." difficulty={4} mechanic="↙↘ Steer"
              palette={{ bg: "linear-gradient(150deg,#0a1030,#050818)", accent: "#b8d0f0", dot: "#ffd9e6", badge: "#204080" }}
              best={bests[4]} onClick={() => setLevelId(4)} />
            <LevelCard num={5} title="Mic Drop" description="Top-down arena. Throw your mic at rival artists before they reach you." difficulty={3} mechanic="🎤 Throw mic"
              palette={{ bg: "linear-gradient(150deg,#2a1810,#160c06)", accent: "#ffd86b", dot: "#ff9ec0", badge: "#8a3a10" }}
              best={bests[5]} onClick={() => setLevelId(5)} />
            <LevelCard num={6} title="Fairground" description="Roller-skate the amusement park. Jump over cotton candy, ice cream and popcorn — faster and faster!" difficulty={3} mechanic="⛸️ Jump"
              palette={{ bg: "linear-gradient(150deg,#1a2a4a,#0e1830)", accent: "#ffd470", dot: "#ff9ec0", badge: "#4a6a20" }}
              best={bests[6]} onClick={() => setLevelId(6)} />
            <LevelCard num={7} title="Night Fall" description="Miss Li rolls into a ball and falls through the forest floor. Guide her through platform gaps in the dark — faster and faster!" difficulty={4} mechanic="← → Steer"
              palette={{ bg: "linear-gradient(150deg,#040c1c,#06122a)", accent: "#6ab87a", dot: "#c8e0ff", badge: "#142840" }}
              best={bests[7]} onClick={() => setLevelId(7)} />
          </div>
        </div>
      </Overlay>

      {/* ── In-game start ── */}
      <Overlay show={!!levelId && state === "start"} onClick={pressJump}>
        <TitleCard>
          <Eyebrow>{["","Forest Tour · Act 1","Cloud Tour · Act 2","Miss Flappy · Act 3","Free Fall · Act 4","Mic Drop · Act 5","Fairground · Act 6","Night Fall · Act 7"][levelId!]}</Eyebrow>
          <BigTitle>Miss Jump</BigTitle>
          <Subtitle>{levelId === 1
            ? "Jump over spikes and gaps. Reach the stage by the waterfall."
            : levelId === 2
            ? "Hop between pink clouds. Watch out for spikes. Reach the sky stage."
            : levelId === 3
            ? "Tap to fly up. Pass through gaps in the clouds. Reach the stage."
            : levelId === 4
            ? "Run until the clouds end — then steer left or right as you fall."
            : levelId === 5
            ? "Top-down arena. Use the joystick to move. Tap the stage to throw your mic. Hit all 40 artists!"
            : levelId === 6
            ? "Roller-skate the fairground. Tap to jump. Dodge cotton candy, ice cream and popcorn. It gets faster and faster!"
            : "Walk Miss Li into the glowing hole in the forest floor. She'll roll into a ball — then steer left and right to fall through the gaps before the platforms push you off the top!"
          }</Subtitle>
          {levelId === 7 && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 14 }}>
              <TiltToggle useTilt={useTilt} onToggle={v => { if (v && !tiltOk) requestTilt().then(() => setUseTilt(true)); else setUseTilt(v); }} />
            </div>
          )}
          <Cta onClick={pressJump}>Start the Show <Key>SPACE</Key></Cta>
          <div onClick={e => e.stopPropagation()}>
            <BackLink onClick={() => setLevelId(null)}>← Change Level</BackLink>
          </div>
        </TitleCard>
      </Overlay>

      {/* ── Lose ── */}
      <Overlay show={!!levelId && state === "lose"} onClick={pressJump}>
        <TitleCard>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🎤</div>
          <Eyebrow>Lost the Beat</Eyebrow>
          <BigTitle style={{ fontSize: "clamp(36px,5vw,60px)" }}>Take {tries + 1}?</BigTitle>
          <Subtitle>The audience is still waiting. Give it another go.</Subtitle>
          <div style={{ margin: "4px 0 18px" }}>
            <Stat label="Attempts" value={String(tries)} />
          </div>
          {levelId === 7 && (
            <div onClick={e => e.stopPropagation()} style={{ marginBottom: 14 }}>
              <TiltToggle useTilt={useTilt} onToggle={v => { if (v && !tiltOk) requestTilt().then(() => setUseTilt(true)); else setUseTilt(v); }} />
            </div>
          )}
          <Cta onClick={pressJump}>Try Again <Key>SPACE</Key></Cta>
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
            <DebugCopyRow
              levelId={levelId!}
              tries={tries}
              progress={progress}
              score={score}
              copied={copied}
              onCopy={() => {
                const names = ["","Forest Tour","Cloud Tour","Miss Flappy","Free Fall","Mic Drop","Fairground"];
                const txt = `Level ${levelId} ${names[levelId!]} · Attempt ${tries} · Died at ${Math.round(progress * 100)}% · Score ${score}`;
                navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
              }}
            />
            <BackLink onClick={() => setLevelId(null)}>← Change Level</BackLink>
          </div>
        </TitleCard>
      </Overlay>

      {/* ── Win ── */}
      <Overlay show={!!levelId && state === "win"}>
        <TitleCard>
          <Eyebrow>Encore</Eyebrow>
          <BigTitle>The Stage is Yours.</BigTitle>
          <Subtitle>The spotlight turns on. The audience holds its breath.</Subtitle>
          {winData && (
            <div style={{ display: "flex", gap: 28, justifyContent: "center", margin: "18px 0 4px" }}>
              <Stat label="Spotlight" value={String(winData.score)} />
              <Stat label="Attempts" value={String(winData.tries)} />
            </div>
          )}
          <Cta onClick={pressJump} style={{ marginTop: 18 }}>Play Again <Key>SPACE</Key></Cta>
          <BackLink onClick={() => setLevelId(null)}>← Change Level / Customize</BackLink>
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

// ── Virtual joystick (Level 5) ───────────────────────────────────────────────

function VirtualJoystick({ onMove }: { onMove: (dx: number, dy: number) => void }) {
  const BASE = 72, THUMB = 32, MAX = (BASE - THUMB) / 2;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const tid = useRef<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = () => el.getBoundingClientRect();

    const onStart = (e: TouchEvent) => {
      if (tid.current !== null) return;
      const t = e.changedTouches[0];
      tid.current = t.identifier;
      move(t.clientX, t.clientY, rect());
    };
    const onMove2 = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tid.current) {
          move(e.changedTouches[i].clientX, e.changedTouches[i].clientY, rect());
        }
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tid.current) {
          tid.current = null; setPos({ x: 0, y: 0 }); onMove(0, 0);
        }
      }
    };
    const move = (cx: number, cy: number, r: DOMRect) => {
      const cx2 = r.left + r.width / 2, cy2 = r.top + r.height / 2;
      let dx = cx - cx2, dy = cy - cy2;
      const len = Math.hypot(dx, dy);
      if (len > MAX) { dx = (dx / len) * MAX; dy = (dy / len) * MAX; }
      setPos({ x: dx, y: dy });
      onMove(dx / MAX, dy / MAX);
    };

    el.addEventListener("touchstart",  onStart,  { passive: true });
    el.addEventListener("touchmove",   onMove2,  { passive: true });
    el.addEventListener("touchend",    onEnd,    { passive: true });
    el.addEventListener("touchcancel", onEnd,    { passive: true });
    return () => {
      el.removeEventListener("touchstart",  onStart);
      el.removeEventListener("touchmove",   onMove2);
      el.removeEventListener("touchend",    onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [onMove]);

  return (
    <div ref={rootRef} style={{
      position: "fixed", bottom: 24, left: 24,
      width: BASE * 1.8, height: BASE * 1.8,
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 20, touchAction: "none", userSelect: "none",
    }}>
      {/* Base ring */}
      <div style={{
        position: "absolute", width: BASE, height: BASE, borderRadius: "50%",
        background: "rgba(255,255,255,0.10)", border: "2px solid rgba(255,255,255,0.25)",
      }} />
      {/* Thumb */}
      <div style={{
        position: "absolute",
        width: THUMB, height: THUMB, borderRadius: "50%",
        background: "rgba(255,255,255,0.45)", border: "2px solid rgba(255,255,255,0.7)",
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: tid.current === null ? "transform 0.1s" : "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}

// ── Customisation UI pieces ──────────────────────────────────────────────────

function PickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 9, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", minWidth: 56, flexShrink: 0 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{children}</div>
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

function LevelCard({ num, title, description, difficulty, mechanic, palette, best, onClick }: {
  num: number; title: string; description: string; difficulty: number; mechanic: string;
  palette: { bg: string; accent: string; dot: string; badge: string };
  best?: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      background: palette.bg, border: `1.5px solid ${palette.accent}55`,
      borderRadius: 16, padding: "18px 16px 16px", cursor: "pointer",
      textAlign: "left", color: "#f5efe6",
      boxShadow: "0 10px 32px rgba(0,0,0,0.45)", outline: "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ background: palette.badge, color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 99 }}>Level {num}</span>
        <span style={{ fontSize: 11, letterSpacing: 1.5 }}>
          {[0,1,2,3].map(i => <span key={i} style={{ color: i < difficulty ? palette.dot : "rgba(255,255,255,0.18)" }}>★</span>)}
        </span>
      </div>
      <div style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, fontStyle: "italic", fontSize: 19, lineHeight: 1.1, marginBottom: 6, color: "#fff" }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(245,239,230,0.65)", marginBottom: 10 }}>{description}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700 }}>{mechanic} &nbsp;→</div>
        {best !== undefined && (
          <div style={{ fontSize: 9, color: palette.dot, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.85 }}>
            Best: {best} {best === 1 ? "try" : "tries"}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Shared overlays ──────────────────────────────────────────────────────────

function Overlay({ show, children, onClick, scrollable }: {
  show: boolean; children: React.ReactNode; onClick?: () => void; scrollable?: boolean;
}) {
  return (
    <div onClick={onClick} style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center",
      justifyContent: scrollable ? "flex-start" : "center",
      overflowY: scrollable ? "auto" : "hidden",
      WebkitOverflowScrolling: scrollable ? ("touch" as React.CSSProperties["WebkitOverflowScrolling"]) : undefined,
      background: "radial-gradient(ellipse at center, rgba(20,14,26,0.55) 0%, rgba(8,6,12,0.78) 100%)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      zIndex: 10, textAlign: "center",
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

function TiltToggle({ useTilt, onToggle }: { useTilt: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "rgba(31,14,38,0.55)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Styrning</div>
      <div style={{ display: "inline-flex", background: "rgba(0,0,0,0.10)", borderRadius: 99, padding: 3, gap: 3 }}>
        <button onClick={() => onToggle(false)} style={{
          padding: "7px 18px", borderRadius: 99, border: "none", cursor: "pointer",
          fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", transition: "all 0.15s",
          background: !useTilt ? "#1f0e26" : "transparent",
          color: !useTilt ? "#fff" : "rgba(31,14,38,0.50)",
        }}>Tryck</button>
        <button onClick={() => onToggle(true)} style={{
          padding: "7px 18px", borderRadius: 99, border: "none", cursor: "pointer",
          fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", transition: "all 0.15s",
          background: useTilt ? "#1f0e26" : "transparent",
          color: useTilt ? "#fff" : "rgba(31,14,38,0.50)",
        }}>📱 Tilt</button>
      </div>
    </div>
  );
}

function DebugCopyRow({ levelId, tries, progress, score, copied, onCopy }: {
  levelId: number; tries: number; progress: number; score: number; copied: boolean; onCopy: () => void;
}) {
  const names = ["", "Skogsturné", "Molnturné", "Miss Flappy", "Fritt Fall"];
  const pct = Math.round(progress * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 4px", justifyContent: "center" }}>
      <span style={{ fontSize: 11, color: "#7a5a6a", fontFamily: "ui-monospace,monospace" }}>
        B{levelId} {names[levelId]} · {pct}% · ⭐{score}
      </span>
      <button
        onClick={onCopy}
        style={{
          fontSize: 11, padding: "3px 10px", borderRadius: 99,
          background: copied ? "#5a9060" : "rgba(90,50,70,0.12)",
          color: copied ? "#fff" : "#7a3a5a",
          border: "1px solid rgba(90,50,70,0.2)",
          cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
        }}
      >
        {copied ? "✓ Kopierat" : "Kopiera"}
      </button>
    </div>
  );
}
