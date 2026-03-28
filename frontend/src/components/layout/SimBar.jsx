import { useState, useRef } from "react";
import { useThemeStore } from "../../store/useThemeStore";
import { useSimStore }   from "../../store/useSimStore";
import { FONT, SPEEDS } from "../../constants/theme";
import { fmtDate } from "../../utils/format";

export default function SimBar({ onPlay, onStepBack, onStepFwd, onSeek, onReset }) {
  const C = useThemeStore((s) => s.colors);
  const { cursor, bars, playing, speed, setSpeed } = useSimStore();

  const [hoverPct, setHoverPct] = useState(null);
  const trackRef = useRef();

  const total      = bars.length;
  const currentBar = bars[cursor - 1];

  const getPct = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const CtrlBtn = ({ icon, onClick, primary = false }) => (
    <button
      onClick={onClick}
      style={{
        background: primary
          ? playing ? C.amber + "22" : C.amber
          : "transparent",
        border:  `1px solid ${primary ? C.amber : C.border2}`,
        color:   primary ? (playing ? C.amber : "#000") : C.muted,
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
    <div style={{ height: 60, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 18px", gap: 10, flexShrink: 0, fontFamily: FONT }}>

      {/* Playback controls */}
      <CtrlBtn icon="⏮" onClick={() => onSeek(0)} />
      <CtrlBtn icon="◀" onClick={onStepBack} />
      <CtrlBtn icon={playing ? "⏸" : "▶"} onClick={onPlay} primary />
      <CtrlBtn icon="▶|" onClick={onStepFwd} />
      <CtrlBtn icon="⏭" onClick={() => onSeek(1)} />

      <div style={{ width: 1, height: 24, background: C.border }} />

      {/* Speed */}
      <div style={{ display: "flex", gap: 4 }}>
        {SPEEDS.map(({ label, v }) => (
          <button key={v} onClick={() => setSpeed(v)} style={{
            background: speed === v ? C.amber + "20" : "transparent",
            border: `1px solid ${speed === v ? C.amber : C.border2}`,
            color:  speed === v ? C.amber : C.muted,
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
        onClick={(e) => onSeek(getPct(e))}
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
      <button onClick={onReset} style={{ background: "transparent", border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontSize: 10, fontFamily: FONT, flexShrink: 0 }}>
        ↺ Reset
      </button>
    </div>
  );
}