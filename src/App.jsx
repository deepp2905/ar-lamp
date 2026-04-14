import { useEffect, useRef, useState } from 'react'
import ColorWheel from './ColorWheel'
import Lamp from './Lamp'
import './App.css'

const lerpAngle = (current, target, t) => {
  const diff = ((target - current + 540) % 360) - 180   // shortest arc, -180..+180
  return (current + diff * t + 360) % 360
}

function App() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  const [isHandDetected, setIsHandDetected] = useState(false)
  const [isFist, setIsFist]                 = useState(false)
  const [handAngle, setHandAngle]           = useState(null)
  const [lampColor, setLampColor]           = useState('#FF0000')
  const [isWheelOn, setIsWheelOn]           = useState(false)

  // Rotation tracking refs
  const prevHandAngleRef    = useRef(null)   // hand angle from last frame
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

        // ── Index finger pointing angle ─────────────────────────────────────
        const indexBase  = landmarks[5]
        const indexTip   = landmarks[8]
        const adx        = -(indexTip.x - indexBase.x)
        const ady        =   indexTip.y  - indexBase.y
        const angleDeg   = ((Math.atan2(ady, adx) * 180 / Math.PI) + 360) % 360

        // ── Incremental rotation (frame-by-frame delta) ─────────────────────
        if (prevHandAngleRef.current === null) {
          prevHandAngleRef.current = angleDeg
        }

        const frameDelta = ((angleDeg - prevHandAngleRef.current + 540) % 360) - 180
        prevHandAngleRef.current = angleDeg

        const newKnob = ((currentKnobAngleRef.current + frameDelta * 2) % 360 + 360) % 360
        currentKnobAngleRef.current = newKnob

        // ── Smoothing ───────────────────────────────────────────────────────
        if (smoothAngleRef.current === null) smoothAngleRef.current = newKnob
        smoothAngleRef.current = lerpAngle(smoothAngleRef.current, newKnob, 0.75)
        setHandAngle(Math.round(smoothAngleRef.current))

        // ── Draw landmarks ──────────────────────────────────────────────────
        for (const lm of results.multiHandLandmarks) {
          window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, {
            color: 'rgba(255,255,255,1)', lineWidth: 0
          })
          window.drawLandmarks(ctx, lm, {
            color: '#fc7e2b', fillColor: '#fc7e2b', lineWidth: 0, radius: 5
          })
        }

      } else {
        setIsHandDetected(false)
        setHandAngle(null)
        setIsFist(false)
        prevHandAngleRef.current = null
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