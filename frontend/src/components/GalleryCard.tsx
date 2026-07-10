import { memo } from 'react'
import type { Template } from '../api'
import { TEXT_LEVEL_LABEL } from '../constants'

interface Props {
  template: Template
  selected: boolean
  showImg: boolean
  onToggle: (id: string) => void
  onImgError: (id: string) => void
}

export const GalleryCard = memo(function GalleryCard({
  template: t,
  selected,
  showImg,
  onToggle,
  onImgError,
}: Props) {
  return (
    <button
      className={`gallery-card ${selected ? 'sel' : ''}`}
      type="button"
      onClick={() => onToggle(t.id)}
      aria-pressed={selected}
      >
        <div className="gc-thumb">
        {showImg ? (
          <img
            src={t.example}
            alt={t.name}
            loading="lazy"
            decoding="async"
            onError={() => onImgError(t.id)}
          />
        ) : (
          <div className="gc-fallback">{t.name.slice(0, 2)}</div>
        )}
        {selected && <span className="gc-check">✓</span>}
        {TEXT_LEVEL_LABEL[t.textLevel] && (
          <span className="gc-txt">{TEXT_LEVEL_LABEL[t.textLevel]}</span>
        )}
      </div>
      <div className="gc-name">{t.name}</div>
      {t.desc && <div className="gc-desc">{t.desc}</div>}
      <div className="gc-en">{t.en}</div>
    </button>
  )
})
