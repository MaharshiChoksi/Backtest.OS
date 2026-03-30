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
  const progressPct = total > 0 ? (cursor / total) * 100 : 0;

  // ── Direct event listeners for pause/step buttons at high speeds ──
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
      } else if (action === 'cycle-speed') {
        e.preventDefault();
        // Cycle through speeds: 1 -> 5 -> 10 -> 50 -> MAX -> 1
        const currentIdx = SPEEDS.findIndex(s => s.v === speed)
        const nextIdx = (currentIdx + 1) % SPEEDS.length
        setSpeed(SPEEDS[nextIdx].v)
      }
    };

    container.addEventListener('mousedown', handleMouseDown, true);
    return () => container.removeEventListener('mousedown', handleMouseDown, true);
  }, [onStepBack, onStepFwd, onSeek, onReset, speed, setSpeed]);

  const getPct = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  const CtrlBtn = ({ icon, onClick, primary = false, dataAction, ...props }) => (
    <button
      onClick={onClick}
      data-action={dataAction}
      {...props}
      style={{
        background: primary
          ? playing ? C.amber + "22" : C.amber
          : "transparent",
        border: `1px solid ${primary ? C.amber : C.border2}`,
        color: primary ? (playing ? C.amber : "#000") : C.muted,
        borderRadius: 5,
        padding: primary ? "7px 18px" : "7px 10px",
        cursor: "pointer",
        fontSize: primary ? 14 : 13,
        fontFamily: FONT,
        fontWeight: primary ? 700 : 400,
        transition: "all .15s",
        flexShrink: 0,
      }}
    >
      {icon}
    </button>
  );

  // Get speed label for display
  const speedLabel = SPEEDS.find(s => s.v === speed)?.label || '1×'

  return (
    <div ref={containerRef} style={{ 
      height: 56, 
      background: C.surf, 
      borderTop: `1px solid ${C.border}`, 
      display: "flex", 
      alignItems: "center", 
      padding: "0 16px", 
      gap: 8, 
      flexShrink: 0, 
      fontFamily: FONT 
    }}>

      {/* Playback controls */}
      <CtrlBtn icon="⏮" dataAction="seek-start" title="Go to start" />
      <CtrlBtn icon="◀" dataAction="step-back" title="Step back" />
      <CtrlBtn icon={playing ? "⏸" : "▶"} dataAction="toggle-play" primary title={playing ? "Pause" : "Play"} />
      <CtrlBtn icon="▶|" dataAction="step-fwd" title="Step forward" />
      <CtrlBtn icon="⏭" dataAction="seek-end" title="Go to end" />

      <div style={{ width: 1, height: 20, background: C.border }} />

      {/* Speed control - click to cycle, shows current speed */}
      <button 
        data-action="cycle-speed" 
        onClick={() => {
          const currentIdx = SPEEDS.findIndex(s => s.v === speed)
          const nextIdx = (currentIdx + 1) % SPEEDS.length
          setSpeed(SPEEDS[nextIdx].v)
        }}
        title="Click to change speed"
        style={{
          background: C.amber + "15",
          border: `1px solid ${C.amber}60`,
          color: C.amber,
          borderRadius: 4,
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: FONT,
          fontWeight: 600,
          minWidth: 48,
          textAlign: 'center',
          transition: "all .15s",
        }}
      >
        {speedLabel}
      </button>

      {/* Speed dropdown on hover */}
      <div style={{ position: 'relative' }}>
        <div style={{ 
          display: "flex", 
          gap: 2,
          background: C.surf2,
          borderRadius: 4,
          padding: 2,
          border: `1px solid ${C.border2}`,
        }}>
          {SPEEDS.map(({ label, v }) => (
            <button 
              key={v} 
              onClick={() => setSpeed(v)} 
              style={{
                background: speed === v ? C.amber + "20" : "transparent",
                border: `1px solid ${speed === v ? C.amber : 'transparent'}`,
                color: speed === v ? C.amber : C.muted,
                borderRadius: 3, 
                padding: "3px 6px", 
                cursor: "pointer",
                fontSize: 10, 
                fontFamily: FONT, 
                fontWeight: speed === v ? 600 : 400,
                transition: "all .15s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: 1, height: 20, background: C.border }} />

      {/* Bar counter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ color: C.text, fontSize: 11, fontWeight: 600 }}>{cursor.toLocaleString()}</span>
        <span style={{ color: C.dim, fontSize: 9 }}>/ {total.toLocaleString()}</span>
      </div>

      {/* Progress track */}
      <div
        style={{ flex: 1, position: "relative", cursor: "pointer", margin: "0 8px" }}
        onMouseMove={(e) => setHoverPct(getPct(e))}
        onMouseLeave={() => setHoverPct(null)}
        onClick={(e) => {
          setPlaying(false);
          onSeek(getPct(e));
        }}
      >
        {hoverPct !== null && (
          <div style={{
            position: "absolute", 
            bottom: "calc(100% + 6px)",
            left: `${hoverPct * 100}%`, 
            transform: "translateX(-50%)",
            background: C.surf2, 
            border: `1px solid ${C.border2}`,
            borderRadius: 4, 
            padding: "2px 6px", 
            fontSize: 10,
            color: C.text, 
            whiteSpace: "nowrap", 
            pointerEvents: "none",
            zIndex: 100,
          }}>
            Bar {Math.round(hoverPct * total).toLocaleString()}
          </div>
        )}
        <div 
          ref={trackRef} 
          style={{ 
            height: 6, 
            background: C.surf3, 
            borderRadius: 3, 
            overflow: "hidden",
            position: 'relative',
          }}
        >
          {/* Progress fill */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: "100%",
            width: `${progressPct}%`,
            background: playing 
              ? `linear-gradient(90deg, ${C.amber}CC, ${C.amber})`
              : C.amber,
            borderRadius: 3,
            transition: playing ? "none" : "width .2s ease-out",
            boxShadow: playing ? `0 0 8px ${C.amber}60` : 'none',
          }} />
          
          {/* Cursor indicator */}
          <div style={{
            position: 'absolute',
            left: `${progressPct}%`,
            top: '-2px',
            width: 2,
            height: 'calc(100% + 4px)',
            background: C.amber,
            transform: 'translateX(-50%)',
            boxShadow: `0 0 4px ${C.amber}`,
          }} />
        </div>
      </div>

      {/* Current bar time */}
      {currentBar && (
        <span style={{ 
          color: C.muted, 
          fontSize: 10, 
          flexShrink: 0,
          background: C.surf2,
          padding: '2px 6px',
          borderRadius: 3,
          border: `1px solid ${C.border2}`,
        }}>
          {fmtDate(currentBar.time)}
        </span>
      )}

      {/* Reset */}
      <button 
        data-action="reset" 
        style={{ 
          background: "transparent", 
          border: `1px solid ${C.border2}`, 
          color: C.muted, 
          borderRadius: 4, 
          padding: "4px 10px", 
          cursor: "pointer", 
          fontSize: 10, 
          fontFamily: FONT, 
          flexShrink: 0 
        }}
      >
        ↺ Reset
      </button>
    </div>
  );
}