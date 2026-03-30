import { useState, useRef, useEffect } from "react";
import { useThemeStore } from "../../store/useThemeStore";
import { useSimStore } from "../../store/useSimStore";
import { FONT, SPEEDS } from "../../constants/index";
import { fmtDate } from "../../utils/format";

export function SimBar({ onStepBack, onStepFwd, onSeek, onReset }) {
  const C = useThemeStore((s) => s.C);
  const { cursor, bars, playing, speed, setSpeed, setPlaying, togglePlaying } = useSimStore();

  const [hoverPct, setHoverPct] = useState(null);
  const trackRef = useRef();
  const containerRef = useRef();

  const total = bars.length;
  const currentBar = bars[cursor - 1] ?? null;

  // ── Direct event listeners for pause/step buttons at high speeds ──
  // These bypass React's event system which gets starved at 5x+ speeds
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e) => {
      const action = e.target.closest('[data-action]')?.getAttribute('data-action');
      if (!action) return;

      if (action === 'toggle-play') {
        e.preventDefault();
        useSimStore.getState().togglePlaying();
      } else if (action === 'step-back') {
        e.preventDefault();
        useSimStore.getState().setPlaying(false);
        onStepBack();
      } else if (action === 'step-fwd') {
        e.preventDefault();
        useSimStore.getState().setPlaying(false);
        onStepFwd();
      } else if (action === 'seek-start') {
        e.preventDefault();
        useSimStore.getState().setPlaying(false);
        onSeek(0);
      } else if (action === 'seek-end') {
        e.preventDefault();
        useSimStore.getState().setPlaying(false);
        onSeek(1);
      } else if (action === 'reset') {
        e.preventDefault();
        useSimStore.getState().setPlaying(false);
        onReset();
      }
    };

    // Use capture phase so we intercept before React's event system
    container.addEventListener('mousedown', handleMouseDown, true);
    return () => container.removeEventListener('mousedown', handleMouseDown, true);
  }, [onStepBack, onStepFwd, onSeek, onReset]);

  const getPct = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const CtrlBtn = ({ icon, onClick, primary = false, ...props }) => (
    <button
      onClick={onClick}
      {...props}
      style={{
        background: primary
          ? playing ? C.amber + "22" : C.amber
          : "transparent",
        border: `1px solid ${primary ? C.amber : C.border2}`,
        color: primary ? (playing ? C.amber : "#000") : C.muted,
        borderRadius: 5,
        padding: primary ? "7px 22px" : "7px 12px",
        cursor: "pointer",
        fontSize: primary ? 14 : 12,
        fontFamily: FONT,
        fontWeight: primary ? 700 : 400,
        transition: "all .15s",
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );

  return (
    <div ref={containerRef} style={{ height: 60, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 18px", gap: 10, flexShrink: 0, fontFamily: FONT }}>

      {/* Playback controls */}
      <CtrlBtn icon="⏮" data-action="seek-start" />
      <CtrlBtn icon="◀" data-action="step-back" />
      <CtrlBtn icon={playing ? "⏸" : "▶"} data-action="toggle-play" primary />
      <CtrlBtn icon="▶|" data-action="step-fwd" />
      <CtrlBtn icon="⏭" data-action="seek-end" />

      <div style={{ width: 1, height: 24, background: C.border }} />

      {/* Speed */}
      <div style={{ display: "flex", gap: 4 }}>
        {SPEEDS.map(({ label, v }) => (
          <button key={v} onClick={() => setSpeed(v)} style={{
            background: speed === v ? C.amber + "20" : "transparent",
            border: `1px solid ${speed === v ? C.amber : C.border2}`,
            color: speed === v ? C.amber : C.muted,
            borderRadius: 4, padding: "4px 8px", cursor: "pointer",
            fontSize: 10, fontFamily: FONT, transition: "all .15s",
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 24, background: C.border }} />

      {/* Bar counter */}
      <span style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>{cursor.toLocaleString()}</span>

      {/* Progress track */}
      <div
        style={{ flex: 1, position: "relative", cursor: "pointer" }}
        onMouseMove={(e) => setHoverPct(getPct(e))}
        onMouseLeave={() => setHoverPct(null)}
        onClick={(e) => {
          setPlaying(false);
          onSeek(getPct(e));
        }}
      >
        {hoverPct !== null && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 8px)",
            left: `${hoverPct * 100}%`, transform: "translateX(-50%)",
            background: C.surf2, border: `1px solid ${C.border2}`,
            borderRadius: 4, padding: "3px 8px", fontSize: 9,
            color: C.text, whiteSpace: "nowrap", pointerEvents: "none",
          }}>
            Bar {Math.round(hoverPct * total).toLocaleString()}
          </div>
        )}
        <div ref={trackRef} style={{ height: 4, background: C.surf3, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${(cursor / total) * 100}%`,
            background: C.amber,
            borderRadius: 2,
            transition: playing ? "none" : "width .1s",
          }} />
        </div>
      </div>

      <span style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>{total.toLocaleString()}</span>

      <div style={{ width: 1, height: 24, background: C.border }} />

      {currentBar && (
        <span style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>{fmtDate(currentBar.time)}</span>
      )}

      {/* Reset */}
      <button data-action="reset" style={{ background: "transparent", border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontSize: 10, fontFamily: FONT, flexShrink: 0 }}>
        ↺ Reset
      </button>
    </div>
  );
}