import { useEffect, useRef, useState } from 'react'
import ColorWheel from './ColorWheel'
import Lamp from './Lamp'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const [isHandDetected, setIsHandDetected] = useState(false)
  const colorWheelRef = useRef(null)
  const canvasRef = useRef(null)
  const bulbRef = useRef(null)
  const [handAngle, setHandAngle] = useState(null)
  const [isFist, setIsFist] = useState(false)

  const [lampColor, setLampColor] = useState('#FF0000')
  const [isWheelOn, setIsWheelOn] = useState(false)

  useEffect(() => {
    const hands = new window.Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    })

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,       // 0 = fastest, 1 = more accurate
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    })

    // hands.onResults(results => {
    //   console.log(results)
    //   if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    //     setIsHandDetected(true)
    //   } else {
    //     setIsHandDetected(false)
    //   }
    // })

    hands.onResults(results => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setIsHandDetected(true)

        const landmarks = results.multiHandLandmarks[0]

        // ── Fist detection: check if fingertips are curled toward palm ──
        const wrist = landmarks[0]
        const fingerTips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]]
        const fingerBases = [landmarks[5], landmarks[9], landmarks[13], landmarks[17]]
        const isFist = fingerTips.every((tip, i) => {
          const base = fingerBases[i]
          const tipDist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y)
          const baseDist = Math.hypot(base.x - wrist.x, base.y - wrist.y)
          return tipDist < baseDist * 1.1  // tip is not further than base = curled
        })

        setIsFist(isFist)

        // ── Color wheel angle: rotation of wrist → middle finger base ──
        const middleBase = landmarks[9]
        const adx = -(middleBase.x - wrist.x)
        const ady = middleBase.y - wrist.y
        const angleDeg = ((Math.atan2(ady, adx) * 180 / Math.PI) + 360) % 360
        setHandAngle(Math.round(angleDeg))

        // Draw landmarks
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
      }
    })


    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user'
          }
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            await hands.send({ image: videoRef.current })
          },
          width: 1280,
          height: 720,
        })

        camera.start()
      } catch (err) {
        console.error('Error accessing webcam: ', err)
        alert('Please allow webcam access to use this app.')
      }
    }

    startCamera()

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

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
          autoOn={isHandDetected  && !isFist}
          externalAngle={handAngle}
          onPowerChange={(on) => setIsWheelOn(on)}
          onAngleChange={(degrees) => setLampColor(`hsl(${Math.round(degrees)}, 100%, 60%)`)}
        />
      </div>

      <div className="resting-overlay">
        <h2 className={isHandDetected ? 'resting-text--hidden' : ''}>
          Waiting for hand movement...
        </h2>
      </div>      

    </div>
  )
}

export default App