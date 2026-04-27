import { useEffect, useRef, useState } from 'react'
import ColorWheel from './ColorWheel'
import Lamp from './Lamp'
import './App.css'

const RotateIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <polyline points="21 3 21 8 16 8" />
  </svg>
)
const PalmIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7"  y1="13" x2="7"  y2="7" />
    <line x1="11" y1="13" x2="11" y2="4" />
    <line x1="15" y1="13" x2="15" y2="4" />
    <line x1="19" y1="13" x2="19" y2="7" />
    <path d="M5 13c0 4 2.5 7 8 7s8-3 8-7" />
  </svg>
)
const FistIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="6" />
    <line x1="9" y1="10" x2="15" y2="10" />
    <line x1="9" y1="13" x2="15" y2="13" />
  </svg>
)

// One Euro Filter — adaptive low-pass: heavy smoothing at rest, light on
// fast motion. minCutoff = base smoothing (Hz), beta = how much fast motion
// raises the cutoff. The standard reference for jittery gesture input.
class OneEuroFilter {
  constructor(minCutoff, beta, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta      = beta
    this.dCutoff   = dCutoff
    this.xPrev = null; this.dxPrev = 0; this.tPrev = null
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }
  filter(x, t) {
    if (this.tPrev === null) { this.tPrev = t; this.xPrev = x; return x }
    const dt = (t - this.tPrev) / 1000
    if (dt <= 0) return this.xPrev
    const dx    = (x - this.xPrev) / dt
    const aD    = OneEuroFilter.alpha(this.dCutoff, dt)
    const dxHat = aD * dx + (1 - aD) * this.dxPrev
    const cut   = this.minCutoff + this.beta * Math.abs(dxHat)
    const a     = OneEuroFilter.alpha(cut, dt)
    const xHat  = a * x + (1 - a) * this.xPrev
    this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = t
    return xHat
  }
  reset() { this.xPrev = null; this.dxPrev = 0; this.tPrev = null }
}

// Filter sin/cos separately so the 360°→0° wrap doesn't blow up the filter.
class CircularOneEuro {
  constructor(minCutoff, beta) {
    this.s = new OneEuroFilter(minCutoff, beta)
    this.c = new OneEuroFilter(minCutoff, beta)
  }
  filter(deg, t) {
    const r  = deg * Math.PI / 180
    const sx = this.s.filter(Math.sin(r), t)
    const cx = this.c.filter(Math.cos(r), t)
    return ((Math.atan2(sx, cx) * 180 / Math.PI) + 360) % 360
  }
  reset() { this.s.reset(); this.c.reset() }
}

const ANGLE_MIN_CUTOFF = 0.8   // Hz — lower = smoother but laggier at rest
const ANGLE_BETA       = 0.2  // higher = snappier when hand moves quickly
const DEADZONE_DEG     = 0.1   // ignore frame deltas below this (kills resting twitch)
const DISPLAY_RATE     = 20    // 1/sec rate constant for RAF display lerp

const lerpAngle = (current, target, t) => {
  const diff = ((target - current + 540) % 360) - 180
  return (current + diff * t + 360) % 360
}

const shortestDelta = (from, to) => ((to - from + 540) % 360) - 180

function App() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  const [isHandDetected, setIsHandDetected] = useState(false)
  const [isFist, setIsFist]                 = useState(false)
  const [handAngle, setHandAngle]           = useState(null)
  const [lampColor, setLampColor]           = useState('hsl(0, 100%, 60%)')
  const [isWheelOn, setIsWheelOn]           = useState(false)

  // Smoothing applied to the raw wrist angle from MediaPipe
  const angleFilterRef       = useRef(new CircularOneEuro(ANGLE_MIN_CUTOFF, ANGLE_BETA))
  const prevSmoothedAngleRef = useRef(null)

  // MediaPipe occasionally drops a frame even when the hand is still visible.
  // Tolerate a short streak of misses before flipping the UI to "not detected".
  const missStreakRef = useRef(0)
  const MISS_FRAMES_TO_LOSE = 8

  // Knob state — target = where the hand/user wants the knob,
  // displayed = what's currently painted. RAF interpolates one toward the other.
  const targetKnobAngleRef    = useRef(0)
  const displayedKnobAngleRef = useRef(0)

  // Independent RAF loop — drives the knob at 60fps regardless of MediaPipe's
  // (variable, slower) callback rate. This is the single biggest visual win.
  useEffect(() => {
    let rafId = null
    let lastT = null

    const tick = now => {
      const dt = Math.min((now - (lastT ?? now)) / 1000, 0.1)
      lastT = now

      const display = displayedKnobAngleRef.current
      const target  = targetKnobAngleRef.current
      const t       = 1 - Math.exp(-DISPLAY_RATE * dt)
      const next    = lerpAngle(display, target, t)

      if (Math.abs(shortestDelta(display, next)) > 0.05) {
        displayedKnobAngleRef.current = next
        setHandAngle(next)
        setLampColor(`hsl(${Math.round(next)}, 100%, 60%)`)
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  useEffect(() => {
    if (window.innerWidth < 1000) return

    const hands = new window.Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    })

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    hands.onResults(results => {
      const canvas = canvasRef.current
      const ctx    = canvas.getContext('2d')

      canvas.width  = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        missStreakRef.current = 0
        setIsHandDetected(true)

        const landmarks = results.multiHandLandmarks[0]
        const wrist     = landmarks[0]

        const fingerTips  = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]
        const fingerBases = [landmarks[5], landmarks[9],  landmarks[13], landmarks[17]]
        const detectedFist = fingerTips.every((tip, i) => {
          const base     = fingerBases[i]
          const tipDist  = Math.hypot(tip.x  - wrist.x, tip.y  - wrist.y)
          const baseDist = Math.hypot(base.x - wrist.x, base.y - wrist.y)
          return tipDist < baseDist * 1.1
        })
        setIsFist(detectedFist)

        // Fist pauses input. Reset filter + baseline so the next open-palm
        // frame establishes a fresh starting point with no jump on release.
        if (detectedFist) {
          angleFilterRef.current.reset()
          prevSmoothedAngleRef.current = null
        } else {
          // Wrist → middle MCP is longer and more rigid than the index-finger
          // vector, so the same MediaPipe pixel-jitter produces less angle noise.
          const middleMcp = landmarks[9]
          const adx       = -(middleMcp.x - wrist.x)
          const ady       =   middleMcp.y - wrist.y
          const rawAngle  = ((Math.atan2(ady, adx) * 180 / Math.PI) + 360) % 360

          const smoothed = angleFilterRef.current.filter(rawAngle, performance.now())

          if (prevSmoothedAngleRef.current === null) {
            prevSmoothedAngleRef.current = smoothed
          }

          let frameDelta = shortestDelta(prevSmoothedAngleRef.current, smoothed)
          prevSmoothedAngleRef.current = smoothed

          if (Math.abs(frameDelta) < DEADZONE_DEG) frameDelta = 0

          targetKnobAngleRef.current =
            ((targetKnobAngleRef.current + frameDelta) % 360 + 360) % 360
        }

        for (const lm of results.multiHandLandmarks) {
          window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, {
            color: 'rgba(255,255,255,0.25)', lineWidth: 1.5
          })
          window.drawLandmarks(ctx, lm, {
            color: '#ffffff', fillColor: '#ffffff', lineWidth: 0, radius: 5
          })
        }

      } else {
        // Brief misses are common — only treat as "lost" after a streak.
        // Until then, keep the smoothing state intact so the angle picks up
        // exactly where it left off when MediaPipe re-acquires.
        missStreakRef.current += 1
        if (missStreakRef.current >= MISS_FRAMES_TO_LOSE) {
          setIsHandDetected(false)
          setIsFist(false)
          angleFilterRef.current.reset()
          prevSmoothedAngleRef.current = null
        }
      }
    })

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width:      { ideal: 1920 },
            height:     { ideal: 1080 },
            facingMode: 'user'
          }
        })

        if (videoRef.current) videoRef.current.srcObject = stream

        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => await hands.send({ image: videoRef.current }),
          width:  1280,
          height: 720,
        })

        camera.start()
      } catch (err) {
        console.error('Error accessing webcam:', err)
        alert('Please allow webcam access to use this app.')
      }
    }

    startCamera()

    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  if (window.innerWidth < 1000) {
    return (
      <div className="mobile-block">
        <p>This experience only works on desktop for now.</p>
      </div>
    )
  }

  const lampOn = isWheelOn && !isFist

  return (
    <div className="app-container">

      <video
        ref={videoRef}
        className="webcam-video"
        autoPlay
        playsInline
        muted
      />

      <canvas ref={canvasRef} className="landmark-canvas" />

      {/* Scene tint — the lamp light spilling onto the room */}
      <div
        className={`scene-tint ${lampOn ? 'scene-tint--on' : ''}`}
        style={{ '--scene-color': lampColor }}
      />

      <Lamp color={lampColor} isOn={lampOn} />

      {/* Instruction pills — crossfade between waiting state and active state */}
      <div className="instruction-bar">
        <div className={`pill pill--solo ${isHandDetected ? 'pill--hidden' : ''}`}>
          <span>Waiting for hand movement</span>
        </div>
        <div className={`pill-group ${!isHandDetected ? 'pill-group--hidden' : ''}`}>
          <div className="pill"><RotateIcon /><span>Rotate wrist</span></div>
          <div className="pill"><PalmIcon   /><span>Open palm to turn on</span></div>
          <div className="pill"><FistIcon   /><span>Close fist to turn off</span></div>
        </div>
      </div>

      {/* Color wheel — controller anchored at the bottom */}
      <div className="controller">
        <ColorWheel
          autoOn={isHandDetected && !isFist}
          externalAngle={handAngle}
          onPowerChange={on => setIsWheelOn(on)}
          onAngleChange={degrees => {
            targetKnobAngleRef.current    = degrees
            displayedKnobAngleRef.current = degrees
            setLampColor(`hsl(${Math.round(degrees)}, 100%, 60%)`)
          }}
        />
      </div>

    </div>
  )
}

export default App
