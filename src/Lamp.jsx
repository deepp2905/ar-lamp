import './Lamp.css'

export default function Lamp({ color, isOn }) {
  return (
    <div className="lamp-container" style={{ '--lamp-color': color || '#ffffff' }}>
      
      <div className={`lamp-glow-outer ${!isOn ? 'lamp-glow--hidden' : ''}`} />
      <div className={`lamp-glow-inner ${!isOn ? 'lamp-glow--hidden' : ''}`} />
      
      <div className={`lamp-bulb ${!isOn ? 'lamp-bulb--off' : ''}`}>
        <div className="lamp-bulb-highlight" />
        <div className="lamp-bulb-shadow" />
      </div>

      <div className="lamp-base">
        <div className="lamp-base-inner">
          <div className="lamp-base-top" />
          <div className="lamp-base-segments">
            <div className="lamp-base-seg-1" />
            <div className="lamp-base-seg-2" />
            <div className="lamp-base-seg-3" />
          </div>
          <div className="lamp-base-bottom" />
        </div>
      </div>
    </div>
  )
}


