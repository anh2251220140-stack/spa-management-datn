import { useState } from 'react'
import { Star } from 'lucide-react'

export default function RatingStars({ value, interactive = false, onChange, size = 20, disabled = false }) {
  const [hovered, setHovered] = useState(0)
  const displayed = interactive && !disabled && hovered ? hovered : Number(value)

  return <span
    className="inline-flex items-center gap-1"
    role={interactive ? 'group' : 'img'}
    aria-label={interactive ? 'Chọn số sao đánh giá' : `${value} trên 5 sao`}
    onMouseLeave={() => setHovered(0)}
  >
    {[1, 2, 3, 4, 5].map(star => {
      const fill = Math.max(0, Math.min(1, displayed - star + 1)) * 100
      const icon = <span className="relative block" style={{ width: size, height: size }} aria-hidden="true">
        <Star size={size} className="fill-none text-stone-300" />
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill}%` }}>
          <Star size={size} className="max-w-none fill-yellow-400 text-yellow-500" />
        </span>
      </span>
      return interactive ? <button
        key={star}
        type="button"
        disabled={disabled}
        aria-label={`${star} sao`}
        aria-pressed={Number(value) === star}
        className="rounded p-1"
        onMouseEnter={() => setHovered(star)}
        onClick={() => onChange?.(star)}
      >{icon}</button> : <span key={star}>{icon}</span>
    })}
  </span>
}
