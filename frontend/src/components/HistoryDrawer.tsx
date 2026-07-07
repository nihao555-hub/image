import type { HistoryEntry } from '../types'
import { fmtTime } from '../types'

interface Props {
  history: HistoryEntry[]
  onClear: () => void
  onClose: () => void
}

export function HistoryDrawer({ history, onClear, onClose }: Props) {
  return (
    <div className="history-overlay" onClick={onClose}>
      <aside className="history-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="history-head">
          <h2>历史记录</h2>
          <div className="history-head-actions">
            {history.length > 0 && (
              <button className="tiny" onClick={onClear}>
                清空
              </button>
            )}
            <button className="tiny" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        {history.length === 0 ? (
          <p className="history-empty">还没有生成记录，批量生成完成后会自动保存到这里。</p>
        ) : (
          <div className="history-scroll">
            {history.map((h) => (
              <section className="history-entry" key={h.id}>
                <div className="history-entry-head">
                  <strong>{h.title}</strong>
                  <span>{fmtTime(h.ts)}</span>
                </div>
                <div className="history-thumbs">
                  {h.images.map((img, i) => (
                    <a
                      key={i}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      title={img.label}
                      className="history-thumb"
                    >
                      <img src={img.url} alt={img.label} loading="lazy" decoding="async" />
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}
