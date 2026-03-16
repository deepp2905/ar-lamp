# Hand-Controlled RGB Lamp

Control a virtual RGB lamp using your hand in front of a webcam. 

## What it does

- **Open hand** → turns the lamp on
- **Closed fist** → turns the lamp off
- **Rotate wrist** → spins the color wheel knob, changing the lamp color in real time
- Hand landmarks are drawn on screen so you can see what the tracker is reading

## Tech

- React + Vite
- MediaPipe Hands (via CDN) for hand tracking
- Custom `ColorWheel` component with drag/click/gesture control
- CSS variable-driven `Lamp` component

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` and allow camera access when prompted.

## Dependencies

No extra installs needed for MediaPipe — it loads from CDN. Make sure `index.html` has these scripts in `<head>`:

```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"></script>
```

## How to use

1. Open the app — you'll see a dark overlay saying "Waiting for hand movement"
2. Hold your **open hand** in front of the camera — the overlay fades, the color wheel powers on
3. **Rotate your wrist** clockwise/counterclockwise to cycle through colors
4. **Close your fist** to turn the lamp off
5. **Open your hand** again to turn it back on — color picks up from where you left it
6. You can also interact with the color wheel manually — click the ring to snap the knob, or drag it directly

## File structure

```
src/
├── App.jsx          # Main app, webcam + MediaPipe logic
├── App.css          # Layout, layers, overlay
├── ColorWheel.jsx   # Interactive color wheel component
├── ColorWheel.css   # Color wheel styles
├── Lamp.jsx         # Lamp bulb + glow component
└── Lamp.css         # Lamp styles + on/off states
public/
└── power.svg        # Power icon used in color wheel
```

## Notes

- Works best with good lighting and a plain background
- Fist detection checks if all four fingertips are closer to the wrist than their respective knuckles
- Hand rotation is relative — the knob starts from its current position when your hand enters the frame