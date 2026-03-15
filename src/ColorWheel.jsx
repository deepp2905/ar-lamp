import { useState, useRef, useEffect, useCallback } from 'react';
import './ColorWheel.css';
import powerIcon from '/power.svg'

// ─── Layout constants (px) ───────────────────────────────────────────────────
const OUTER_ON  = 400;   // active outer ring diameter
const OUTER_OFF = 280;   // off outer ring diameter
const INNER     = 250;   // inner dark circle diameter
const KNOB      = 71;    // draggable knob diameter
const ORBIT     = (OUTER_ON / 2 + INNER / 2) / 2; // knob orbit radius

// ─── Animation constants ─────────────────────────────────────────────────────
const SPIN_DUR  = 1400;  // knob entrance full-360 spin (ms)
const SLIDE_DUR = 520;   // ring-click knob slide-to-position (ms)

// ease-in-out cubic — used for both spin and slide
const easeInOutCubic = t =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;


// ─── Main component ──────────────────────────────────────────────────────────
/**
 * ColorWheel
 *
 * Props:
 *   onPowerChange(isOn: boolean)     — fired when power state toggles
 *   onAngleChange(degrees: number)   — fired whenever the knob angle changes
 */
export default function ColorWheel({ onPowerChange, onAngleChange, autoOn }) {
  const [isOn, setIsOn]           = useState(false);
  const [dispAngle, _setDispAngle] = useState(0);
  const [knobOpacity, setKnobOpacity] = useState(0);

  // Keep angle in a ref so RAF callbacks always read the latest value without
  // triggering re-renders on every frame
  const angleRef  = useRef(0);
  const setAngle  = useCallback(v => {
    angleRef.current = v;
    _setDispAngle(v);
    onAngleChange?.(((v % 360) + 360) % 360);
  }, [onAngleChange]);

  const containerRef = useRef(null);
  const rafRef       = useRef(null);
  const timerRef     = useRef(null);
  const dragging     = useRef(false);
  const didDrag      = useRef(false);

  // Cancel any in-progress animation
  const stopAnim = useCallback(() => {
    if (rafRef.current)  { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (timerRef.current){ clearTimeout(timerRef.current);       timerRef.current = null; }
  }, []);

  // ── Knob entrance: full 360° spin starting from current position ────────
  const runSpin = useCallback(() => {
    const base = ((angleRef.current % 360) + 360) % 360;
    const t0   = performance.now();

    const tick = now => {
      const t        = Math.min((now - t0) / SPIN_DUR, 1);
      const traveled = easeInOutCubic(t) * 360;
      const next     = base + traveled;

      angleRef.current = next;
      _setDispAngle(next);

      // Opacity: 0 → 1 over the first 180° of travel, then locked at 1
      setKnobOpacity(Math.min(traveled / 270, 1));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Snap back to exact base position (no floating-point drift)
        angleRef.current = base;
        _setDispAngle(base);
        setKnobOpacity(1);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Ring click: slide knob to target angle via shortest arc ────────────
  const slideKnobTo = useCallback(target => {
    stopAnim();
    const from = ((angleRef.current % 360) + 360) % 360;
    const norm = ((target % 360) + 360) % 360;
    let diff   = norm - from;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;

    const t0 = performance.now();
    const tick = now => {
      const t = Math.min((now - t0) / SLIDE_DUR, 1);
      const v = from + diff * easeInOutCubic(t);
      angleRef.current = v;
      _setDispAngle(v);
      onAngleChange?.(((v % 360) + 360) % 360);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopAnim, onAngleChange]);

  // ── Power on ─────────────────────────────────────────────────────────────
  const turnOn = useCallback(() => {
    stopAnim();
    setKnobOpacity(0);
    setIsOn(true);
    onPowerChange?.(true);
    runSpin(); // starts immediately — remove runSpin() and use setTimeout(runSpin, 580) if you want to wait for the ring expand animation
  }, [runSpin, stopAnim, onPowerChange]);

  // ── Power off ────────────────────────────────────────────────────────────
  const turnOff = useCallback(() => {
    stopAnim();
    setKnobOpacity(0);
    setIsOn(false);
    onPowerChange?.(false);
  }, [stopAnim, onPowerChange]);

  // ── Pointer angle helper ─────────────────────────────────────────────────
  const getAngle = useCallback(e => {
    const r  = containerRef.current?.getBoundingClientRect();
    if (!r) return 0;
    const cx = r.left + r.width  / 2;
    const cy = r.top  + r.height / 2;
    const px = (e.touches?.[0] ?? e).clientX;
    const py = (e.touches?.[0] ?? e).clientY;
    return (((Math.atan2(py - cy, px - cx) * 180 / Math.PI + 90) % 360) + 360) % 360;
  }, []);

  // ── Global drag listeners ────────────────────────────────────────────────
  useEffect(() => {
    const onMove = e => {
      if (!dragging.current) return;
      if (e.cancelable) e.preventDefault();
      didDrag.current = true;
      stopAnim();
      const a = getAngle(e);
      angleRef.current = a;
      _setDispAngle(a);
      setKnobOpacity(1);
      onAngleChange?.(a);
    };
    const onUp = () => { dragging.current = false; };

    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onUp);
    window.addEventListener('touchmove',  onMove, { passive: false });
    window.addEventListener('touchend',   onUp);
    return () => {
      window.removeEventListener('mousemove',  onMove);
      window.removeEventListener('mouseup',    onUp);
      window.removeEventListener('touchmove',  onMove);
      window.removeEventListener('touchend',   onUp);
    };
  }, [getAngle, stopAnim, onAngleChange]);

  // Cleanup on unmount
  useEffect(() => () => stopAnim(), [stopAnim]);

  // ── Click handler on the wheel ───────────────────────────────────────────
  const handleClick = e => {
    if (didDrag.current) { didDrag.current = false; return; }
    const r    = containerRef.current?.getBoundingClientRect();
    const cx   = r.left + r.width  / 2;
    const cy   = r.top  + r.height / 2;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);

    if (!isOn) {
      if (dist <= OUTER_OFF / 2) turnOn();
    } else {
      if (dist <= INNER / 2)     turnOff();                 // center → power off
      else if (dist <= OUTER_ON / 2) slideKnobTo(getAngle(e)); // ring → slide knob
    }
  };

  useEffect(() => {
    if (autoOn && !isOn) turnOn()
    // if (!autoOn && isOn) turnOff() // turns off the lamp if hands are not visible
  }, [autoOn])

  // ── Derived knob position ────────────────────────────────────────────────
  const rad   = (dispAngle - 90) * Math.PI / 180;
  const knobX = OUTER_ON / 2 + ORBIT * Math.cos(rad) - KNOB / 2;
  const knobY = OUTER_ON / 2 + ORBIT * Math.sin(rad) - KNOB / 2;
  const outerSize = isOn ? OUTER_ON : OUTER_OFF;

  return (
    <div className="cw-root">
      <div
        ref={containerRef}
        className="cw-stage"
        onClick={handleClick}
      >
        {/* Color wheel ring */}
        <div
          className={`cw-ring ${isOn ? 'cw-ring--on' : 'cw-ring--off'}`}
          style={{ width: outerSize, height: outerSize }}
        />

        {/* Inner dark circle */}
        <div className={`cw-inner ${isOn ? 'cw-inner--on' : ''}`} />

        {/* Center content */}
        <div className="cw-center">
          <div className={`cw-off-content ${isOn ? 'cw-off-content--hidden' : ''}`}>
            <img src={powerIcon} width={72} height={72} alt="power" />
            <span className="cw-label-off">POWER OFF</span>
          </div>

          <div className={`cw-on-content ${isOn ? 'cw-on-content--visible' : ''}`}>
            <span className="cw-brightness-value">100%</span>
            <span className="cw-brightness-label">BRIGHTNESS</span>
          </div>
        </div>

        {/* Draggable knob */}
        <div
          className="cw-knob"
          style={{
            left:    knobX,
            top:     knobY,
            opacity: knobOpacity,
            pointerEvents: isOn ? 'auto' : 'none',
          }}
          onMouseDown={e => {
            if (!isOn) return;
            e.stopPropagation();
            stopAnim();
            dragging.current = true;
            didDrag.current  = false;
          }}
          onTouchStart={e => {
            if (!isOn) return;
            e.stopPropagation();
            stopAnim();
            dragging.current = true;
            didDrag.current  = false;
          }}
          onClick={e => e.stopPropagation()}
        />
      </div>
    </div>
  );
}