import { useEffect, useRef, useState } from 'react'
import ColorWheel from './ColorWheel'
import Lamp from './Lamp'
import './App.css'

const lerp = (a, b, t) => a + (b - a) * t

function App() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  const [isHandDetected, setIsHandDetected] = useState(false)
  const [isFist, setIsFist]                 = useState(false)
  const [handAngle, setHandAngle]           = useState(null)
  const [lampColor, setLampColor]           = useState('#FF0000')
  const [isWheelOn, setIsWheelOn]           = useState(false)

  // Relative rotation refs
  const baseHandAngleRef    = useRef(null)
  const baseKnobAngleRef    = useRef(null)
  const currentKnobAngleRef = useRef(0)
  const smoothAngleRef      = useRef(null)

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
        setIsHandDetected(true)

        const landmarks = results.multiHandLandmarks[0]
        const wrist     = landmarks[0]

        // ── Fist detection ──────────────────────────────────────────────────
        const fingerTips  = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]
        const fingerBases = [landmarks[5], landmarks[9],  landmarks[13], landmarks[17]]
        const detectedFist = fingerTips.every((tip, i) => {
          const base     = fingerBases[i]
          const tipDist  = Math.hypot(tip.x  - wrist.x, tip.y  - wrist.y)
          const baseDist = Math.hypot(base.x - wrist.x, base.y - wrist.y)
          return tipDist < baseDist * 1.1
        })
        setIsFist(detectedFist)

        // ── Wrist rotation angle ────────────────────────────────────────────
        const middleBase = landmarks[9]
        const adx        = -(middleBase.x - wrist.x)
        const ady        =   middleBase.y  - wrist.y
        const angleDeg   = ((Math.atan2(ady, adx) * 180 / Math.PI) + 360) % 360

        // ── Relative rotation ───────────────────────────────────────────────
        if (baseHandAngleRef.current === null) {
          baseHandAngleRef.current = angleDeg
          baseKnobAngleRef.current = currentKnobAngleRef.current
        }

        const delta      = angleDeg - baseHandAngleRef.current
        const targetKnob = ((baseKnobAngleRef.current + delta) % 360 + 360) % 360

        // ── Smoothing ───────────────────────────────────────────────────────
        if (smoothAngleRef.current === null) smoothAngleRef.current = targetKnob
        smoothAngleRef.current = lerp(smoothAngleRef.current, targetKnob, 0.8)
        setHandAngle(Math.round(smoothAngleRef.current))

        // ── Draw landmarks ──────────────────────────────────────────────────
        for (const lm of results.multiHandLandmarks) {
          window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, {
            color: 'rgba(255,255,255,0.5)', lineWidth: 2
          })
          window.drawLandmarks(ctx, lm, {
            color: '#fff', fillColor: '#6366f1', lineWidth: 1, radius: 4
          })
        }

      } else {
        setIsHandDetected(false)
        setHandAngle(null)
        setIsFist(false)
        baseHandAngleRef.current = null
        baseKnobAngleRef.current = null
        smoothAngleRef.current   = null
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

      <Lamp color={lampColor} isOn={isWheelOn && !isFist} />

      <div className="ui-layer">
        <ColorWheel
          autoOn={isHandDetected && !isFist}
          externalAngle={handAngle}
          onPowerChange={on => setIsWheelOn(on)}
          onAngleChange={degrees => {
            currentKnobAngleRef.current = degrees
            setLampColor(`hsl(${Math.round(degrees)}, 100%, 60%)`)
          }}
        />
      </div>

      <div className="resting-overlay">
        <h2 className={`resting-msg ${isHandDetected ? 'resting-msg--hidden' : ''}`}>
          Waiting for hand movement...
        </h2>
        <h2 className={`resting-msg ${!isHandDetected ? 'resting-msg--hidden' : ''}`}>
          Rotate wrist to change color · Open palm to turn on · Close fist to turn off
        </h2>
      </div>

    </div>
  )
}

export default App