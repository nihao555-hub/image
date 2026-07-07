import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchResults, submitWatermark } from '../api'

const MAX_FILES = 1000
const MAX_ATTEMPTS = 5

type WmStatus = 'ready' | 'processing' | 'done' | 'failed'

interface WmItem {
  id: string
  name: string
  dataUrl: string
  taskId: string
  status: WmStatus
  attempts: number
  resultUrl: string
  error: string
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const STATUS_LABEL: Record<WmStatus, string> = {
  ready: '待处理',
  processing: '处理中',
  done: '已完成',
  failed: '失败',
}

export function WatermarkPage() {
  const [items, setItems] = useState<WmItem[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const itemsRef = useRef<WmItem[]>([])
  const pollRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  itemsRef.current = items

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!list.length) return
    setError('')
    setItems((prev) => {
      const room = MAX_FILES - prev.length
      if (list.length > room) {
        setError(`一次最多处理 ${MAX_FILES} 张图片，已忽略超出的 ${list.length - room} 张`)
      }
      return prev
    })
    const room = MAX_FILES - itemsRef.current.length
    const accepted = list.slice(0, Math.max(0, room))
    const loaded = await Promise.all(
      accepted.map(async (f, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        dataUrl: await readFile(f),
        taskId: '',
        status: 'ready' as WmStatus,
        attempts: 0,
        resultUrl: '',
        error: '',
      })),
    )
    setItems((prev) => [...prev, ...loaded].slice(0, MAX_FILES))
  }, [])

  const removeItem = useCallback(
    (id: string) => setItems((prev) => prev.filter((x) => x.id !== id)),
    [],
  )
  const clearAll = useCallback(() => setItems([]), [])

  // Submit one image; each submit consumes one attempt.
  const submitOne = useCallback(async (item: WmItem): Promise<WmItem> => {
    try {
      const taskId = await submitWatermark(item.dataUrl)
      return { ...item, taskId, status: 'processing', attempts: item.attempts + 1, error: '' }
    } catch (e) {
      const next: WmItem = { ...item, attempts: item.attempts + 1, error: String(e) }
      return next.attempts >= MAX_ATTEMPTS
        ? { ...next, status: 'failed' }
        : { ...next, status: 'processing', taskId: '' }
    }
  }, [])

  const poll = useCallback(async () => {
    const current = itemsRef.current
    const processing = current.filter((x) => x.status === 'processing')
    if (!processing.length) {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
      setRunning(false)
      return
    }

    // Resubmit items whose previous submit failed but still have attempts left.
    const needResubmit = processing.filter((x) => !x.taskId)
    if (needResubmit.length) {
      const resubmitted = await Promise.all(needResubmit.map(submitOne))
      const byId = new Map(resubmitted.map((x) => [x.id, x]))
      setItems((prev) => prev.map((x) => byId.get(x.id) ?? x))
    }

    const ids = itemsRef.current
      .filter((x) => x.status === 'processing' && x.taskId)
      .map((x) => x.taskId)
    if (!ids.length) return
    let res: Record<string, { status: string; results: { url: string }[]; failure_reason?: string; error?: string }>
    try {
      res = await fetchResults(ids)
    } catch {
      return // transient error, keep polling
    }

    const retries: WmItem[] = []
    setItems((prev) =>
      prev.map((x) => {
        if (x.status !== 'processing' || !x.taskId) return x
        const r = res[x.taskId]
        if (!r) return x
        if (r.status === 'succeeded' && r.results?.[0]?.url) {
          return { ...x, status: 'done', resultUrl: r.results[0].url }
        }
        if (r.status === 'failed' || r.status === 'error') {
          const reason = r.failure_reason || r.error || '处理失败'
          if (x.attempts >= MAX_ATTEMPTS) return { ...x, status: 'failed', error: reason }
          const retry = { ...x, taskId: '', error: reason }
          retries.push(retry)
          return retry
        }
        return x
      }),
    )
    if (retries.length) {
      const resubmitted = await Promise.all(retries.map(submitOne))
      const byId = new Map(resubmitted.map((x) => [x.id, x]))
      setItems((prev) => prev.map((x) => byId.get(x.id) ?? x))
    }
  }, [submitOne])

  const start = useCallback(async () => {
    const targets = itemsRef.current.filter((x) => x.status === 'ready' || x.status === 'failed')
    if (!targets.length) return
    setError('')
    setRunning(true)
    const targetIds = new Set(targets.map((x) => x.id))
    setItems((prev) =>
      prev.map((x) =>
        targetIds.has(x.id)
          ? { ...x, status: 'processing', attempts: 0, taskId: '', resultUrl: '', error: '' }
          : x,
      ),
    )
    // Fire every submission at once — the whole batch is processed in parallel.
    const submitted = await Promise.all(
      targets.map((x) => submitOne({ ...x, status: 'processing', attempts: 0, taskId: '' })),
    )
    const byId = new Map(submitted.map((x) => [x.id, x]))
    setItems((prev) => prev.map((x) => byId.get(x.id) ?? x))
    if (pollRef.current) window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(() => void poll(), 4000)
  }, [poll, submitOne])

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  const doneCount = items.filter((x) => x.status === 'done').length
  const failedCount = items.filter((x) => x.status === 'failed').length
  const processingCount = items.filter((x) => x.status === 'processing').length
  const pendingCount = items.filter((x) => x.status === 'ready' || x.status === 'failed').length

  return (
    <div className="wm-page">
      {error && <div className="error-bar">{error}</div>}
      <div className="wm-toolbar">
        <div className="wm-stats">
          <span>
            共 <b>{items.length}</b> 张
          </span>
          {processingCount > 0 && <span className="wm-stat-processing">处理中 {processingCount}</span>}
          {doneCount > 0 && <span className="wm-stat-done">完成 {doneCount}</span>}
          {failedCount > 0 && <span className="wm-stat-failed">失败 {failedCount}</span>}
        </div>
        <div className="wm-actions">
          <button className="secondary" onClick={() => inputRef.current?.click()}>
            添加图片
          </button>
          <button className="secondary" onClick={clearAll} disabled={!items.length || running}>
            清空
          </button>
          <button className="primary big" onClick={start} disabled={running || pendingCount === 0}>
            {running ? `处理中… ${doneCount}/${items.length}` : `开始去水印 · ${pendingCount} 张`}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {items.length === 0 ? (
        <div
          className="wm-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void addFiles(e.dataTransfer.files)
          }}
        >
          <div className="wm-drop-icon">⇪</div>
          <h3>点击或拖入图片，批量去除水印</h3>
          <p>
            一次最多 {MAX_FILES} 张 · 全部同时处理 · 失败自动重试（最多 {MAX_ATTEMPTS} 次）
            <br />
            仅去除覆盖在图上的水印 / logo / 网址等，商品自身的文字与装饰会保留
          </p>
        </div>
      ) : (
        <div
          className="wm-grid"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void addFiles(e.dataTransfer.files)
          }}
        >
          {items.map((x) => (
            <figure className={`wm-card st-${x.status}`} key={x.id}>
              <div className="wm-thumb">
                <img src={x.resultUrl || x.dataUrl} alt={x.name} loading="lazy" decoding="async" />
                {x.status === 'processing' && (
                  <div className="wm-mask">
                    <span className="spinner" />
                    {x.attempts > 1 && <em>第 {x.attempts} 次尝试</em>}
                  </div>
                )}
                {!running && x.status === 'ready' && (
                  <button className="wm-del" title="移除" onClick={() => removeItem(x.id)}>
                    ×
                  </button>
                )}
              </div>
              <figcaption>
                <span className="wm-name" title={x.name}>
                  {x.name}
                </span>
                <span className={`wm-status st-${x.status}`} title={x.error || undefined}>
                  {STATUS_LABEL[x.status]}
                </span>
              </figcaption>
              {x.status === 'done' && x.resultUrl && (
                <a className="download" href={x.resultUrl} target="_blank" rel="noreferrer" download>
                  下载
                </a>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
