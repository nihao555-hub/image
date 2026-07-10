import JSZip from 'jszip'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_ATTEMPTS } from '../constants'
import { fetchResults, submitRestore, type RestoreMode, type TaskResult } from '../api'

export type RestoreFeature = 'watermark' | 'upscale'

const FEATURE_TEXT: Record<
  RestoreFeature,
  { action: string; dropTitle: string; dropHint: string; promptPlaceholder: string }
> = {
  watermark: {
    action: '开始去水印',
    dropTitle: '点击或拖入图片，批量去除水印',
    dropHint: '仅去除覆盖在图上的水印 / logo / 网址等，商品本身（含商品自带文字图案）完全不变',
    promptPlaceholder: '例如：清除背景和边框中的全部文字，只保留商品包装上原有文字',
  },
  upscale: {
    action: '开始超清处理',
    dropTitle: '点击或拖入图片，批量变超清',
    dropHint: '模糊变高清：锐化细节、去噪，图中文字 / 参数变清晰，内容不会被改变',
    promptPlaceholder: '例如：重点增强商品表面纹理，保持原始颜色和构图',
  },
}

const MAX_FILES = 1000
const RESTORE_SUBMIT_CONCURRENCY = 1000
const RESULT_POLL_BATCH_SIZE = 80
const ASPECT_OPTIONS = [
  { value: '', label: '原图比例' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
] as const

type WmStatus = 'ready' | 'processing' | 'done' | 'failed'

interface WmImage {
  id: string
  name: string
  dataUrl: string
  taskId: string
  status: WmStatus
  attempts: number
  progress: number
  resultUrl: string
  error: string
}

interface WmTask {
  id: string
  name: string
  createdAt: number
  running: boolean
  mode: RestoreMode
  aspectRatio: string
  prompt: string
  images: WmImage[]
  startedAt?: number
  finishedAt?: number
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}分${s % 60}秒` : `${s}秒`
}

function taskElapsed(t: WmTask, now: number): string {
  if (!t.startedAt) return ''
  return fmtDur((t.running ? now : (t.finishedAt ?? now)) - t.startedAt)
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function runConcurrent<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await worker(item)
    }
  })
  await Promise.all(workers)
}

async function fetchResultsByBatch(ids: string[]): Promise<Record<string, TaskResult>> {
  const merged: Record<string, TaskResult> = {}
  for (let i = 0; i < ids.length; i += RESULT_POLL_BATCH_SIZE) {
    Object.assign(merged, await fetchResults(ids.slice(i, i + RESULT_POLL_BATCH_SIZE)))
  }
  return merged
}

// Tasks are persisted per feature so progress and results survive tab
// switches and page reloads. Source dataUrls are dropped when the payload
// exceeds the localStorage quota.
function storageKey(feature: RestoreFeature) {
  return `tj-tasks-${feature}`
}

function loadTasks(feature: RestoreFeature): WmTask[] | null {
  try {
    const raw = localStorage.getItem(storageKey(feature))
    if (!raw) return null
    const parsed = JSON.parse(raw) as WmTask[]
    if (!Array.isArray(parsed) || !parsed.length) return null
    return parsed.map((t) => ({
      ...t,
      aspectRatio: typeof t.aspectRatio === 'string' ? t.aspectRatio : '',
      prompt: typeof t.prompt === 'string' ? t.prompt : '',
      images: (t.images ?? []).map((x) => ({
        ...x,
        // A submit interrupted by a reload cannot be resumed without its source.
        status: x.status === 'processing' && !x.taskId ? 'failed' : x.status,
      })),
    }))
  } catch {
    return null
  }
}

function saveTasks(feature: RestoreFeature, tasks: WmTask[]) {
  const slim = (dropDataUrl: boolean) =>
    JSON.stringify(
      tasks.map((t) => ({
        ...t,
        images: t.images.map((x) => (dropDataUrl ? { ...x, dataUrl: '' } : x)),
      })),
    )
  try {
    localStorage.setItem(storageKey(feature), slim(false))
  } catch {
    try {
      localStorage.setItem(storageKey(feature), slim(true))
    } catch {
      // Storage unavailable; keep in-memory state only.
    }
  }
}

const STATUS_LABEL: Record<WmStatus, string> = {
  ready: '待处理',
  processing: '处理中',
  done: '已完成',
  failed: '失败',
}

function taskProgress(t: WmTask): number {
  if (!t.images.length) return 0
  const sum = t.images.reduce((acc, img) => {
    if (img.status === 'done') return acc + 100
    if (img.status === 'processing') return acc + Math.min(img.progress, 95)
    if (img.status === 'failed') return acc + 100
    return acc
  }, 0)
  return Math.round(sum / t.images.length)
}

export function WatermarkPage({ feature }: { feature: RestoreFeature }) {
  const text = FEATURE_TEXT[feature]
  const [tasks, setTasks] = useState<WmTask[]>(
    () =>
      loadTasks(feature) ?? [
        {
          id: uid(),
          name: '任务 1',
          createdAt: Date.now(),
          running: false,
          mode: 'pro',
          aspectRatio: '',
          prompt: '',
          images: [],
        },
      ],
  )
  const [activeId, setActiveId] = useState(() => '')
  const [error, setError] = useState('')
  const tasksRef = useRef<WmTask[]>([])
  const submittingRef = useRef<Set<string>>(new Set())
  const pollRef = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  tasksRef.current = tasks

  useEffect(() => {
    if (tasks.length && !tasks.find((t) => t.id === activeId)) setActiveId(tasks[0].id)
  }, [tasks, activeId])

  const active = tasks.find((t) => t.id === activeId) ?? tasks[0]

  const patchTask = useCallback((taskId: string, fn: (t: WmTask) => WmTask) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? fn(t) : t)))
  }, [])

  const patchImages = useCallback(
    (taskId: string, fn: (img: WmImage) => WmImage) => {
      patchTask(taskId, (t) => ({ ...t, images: t.images.map(fn) }))
    },
    [patchTask],
  )

  const newTask = useCallback(() => {
    const t: WmTask = {
      id: uid(),
      name: `任务 ${tasksRef.current.length + 1}`,
      createdAt: Date.now(),
      running: false,
      mode: 'pro',
      aspectRatio: '',
      prompt: '',
      images: [],
    }
    setTasks((prev) => [t, ...prev])
    setActiveId(t.id)
  }, [])

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }, [])

  const addFiles = useCallback(
    async (taskId: string, files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (!list.length) return
      setError('')
      const task = tasksRef.current.find((t) => t.id === taskId)
      const room = MAX_FILES - (task?.images.length ?? 0)
      if (list.length > room) {
        setError(`每个任务最多 ${MAX_FILES} 张图片，已忽略超出的 ${list.length - room} 张`)
      }
      const accepted = list.slice(0, Math.max(0, room))
      const loaded: WmImage[] = await Promise.all(
        accepted.map(async (f) => ({
          id: uid(),
          name: f.name,
          dataUrl: await readFile(f),
          taskId: '',
          status: 'ready' as WmStatus,
          attempts: 0,
          progress: 0,
          resultUrl: '',
          error: '',
        })),
      )
      patchTask(taskId, (t) => ({ ...t, images: [...t.images, ...loaded].slice(0, MAX_FILES) }))
    },
    [patchTask],
  )

  const removeImage = useCallback(
    (taskId: string, imgId: string) => {
      patchTask(taskId, (t) => ({ ...t, images: t.images.filter((x) => x.id !== imgId) }))
    },
    [patchTask],
  )

  // Submit one image; each submit consumes one attempt.
  const submitOne = useCallback(
    async (
      img: WmImage,
      mode: RestoreMode,
      aspectRatio: string,
      prompt: string,
    ): Promise<WmImage> => {
      try {
        const taskId = await submitRestore(feature, img.dataUrl, mode, aspectRatio, prompt)
        return { ...img, taskId, status: 'processing', attempts: img.attempts + 1, error: '' }
      } catch (e) {
        const next: WmImage = { ...img, attempts: img.attempts + 1, error: String(e) }
        return next.attempts >= MAX_ATTEMPTS
          ? { ...next, status: 'failed' }
          : { ...next, status: 'processing', taskId: '' }
      }
    },
    [feature],
  )

  const applyImagePatches = useCallback(
    (taskId: string, patched: WmImage[]) => {
      const byId = new Map(patched.map((x) => [x.id, x]))
      patchImages(taskId, (x) => byId.get(x.id) ?? x)
    },
    [patchImages],
  )

  const submitQueued = useCallback(
    async (
      taskId: string,
      images: WmImage[],
      mode: RestoreMode,
      aspectRatio: string,
      prompt: string,
    ) => {
      await runConcurrent(images, RESTORE_SUBMIT_CONCURRENCY, async (img) => {
        if (submittingRef.current.has(img.id)) return
        submittingRef.current.add(img.id)
        try {
          applyImagePatches(taskId, [await submitOne(img, mode, aspectRatio, prompt)])
        } finally {
          submittingRef.current.delete(img.id)
        }
      })
    },
    [applyImagePatches, submitOne],
  )

  const poll = useCallback(async () => {
    const running = tasksRef.current.filter((t) => t.running)
    if (!running.length) {
      if (pollRef.current) window.clearInterval(pollRef.current)
      pollRef.current = null
      return
    }

    for (const task of running) {
      const processing = task.images.filter((x) => x.status === 'processing')
      if (!processing.length) {
        patchTask(task.id, (t) => ({ ...t, running: false, finishedAt: Date.now() }))
        continue
      }
      // Resubmit images whose previous submit failed but still have attempts left.
      const needResubmit = processing.filter(
        (x) => !x.taskId && !submittingRef.current.has(x.id),
      )
      if (needResubmit.length) {
        void submitQueued(
          task.id,
          needResubmit,
          task.mode,
          task.aspectRatio,
          task.prompt,
        )
      }
    }

    const ids = tasksRef.current
      .filter((t) => t.running)
      .flatMap((t) => t.images)
      .filter((x) => x.status === 'processing' && x.taskId)
      .map((x) => x.taskId)
    if (!ids.length) return

    let res: Record<string, TaskResult>
    try {
      res = await fetchResultsByBatch(ids)
    } catch {
      return // transient error, keep polling
    }

    for (const task of tasksRef.current.filter((t) => t.running)) {
      const retries: WmImage[] = []
      patchImages(task.id, (x) => {
        if (x.status !== 'processing' || !x.taskId) return x
        const r = res[x.taskId]
        if (!r) return x
        if (r.status === 'succeeded' && r.results?.[0]?.url) {
          return { ...x, status: 'done', progress: 100, resultUrl: r.results[0].url }
        }
        if (r.status === 'failed' || r.status === 'error') {
          const reason = r.failure_reason || r.error || '处理失败'
          if (x.attempts >= MAX_ATTEMPTS) return { ...x, status: 'failed', error: reason }
          const retry = { ...x, taskId: '', error: reason }
          retries.push(retry)
          return retry
        }
        return { ...x, progress: typeof r.progress === 'number' ? r.progress : x.progress }
      })
      if (retries.length) {
        void submitQueued(
          task.id,
          retries,
          task.mode,
          task.aspectRatio,
          task.prompt,
        )
      }
    }
  }, [patchImages, patchTask, submitQueued])

  const ensurePolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = window.setInterval(() => void poll(), 4000)
  }, [poll])

  const startWith = useCallback(
    async (taskId: string, statuses: WmStatus[]) => {
      const task = tasksRef.current.find((t) => t.id === taskId)
      if (!task) return
      const targets = task.images.filter((x) => statuses.includes(x.status))
      if (!targets.length) return
      setError('')
      const targetIds = new Set(targets.map((x) => x.id))
      patchTask(taskId, (t) => ({
        ...t,
        running: true,
        startedAt: Date.now(),
        finishedAt: undefined,
        images: t.images.map((x) =>
          targetIds.has(x.id)
            ? { ...x, status: 'processing', attempts: 0, taskId: '', progress: 0, resultUrl: '', error: '' }
            : x,
        ),
      }))
      ensurePolling()
      await submitQueued(
        taskId,
        targets.map((x) =>
          ({
            ...x,
            status: 'processing',
            attempts: 0,
            taskId: '',
            progress: 0,
            resultUrl: '',
            error: '',
          }) as WmImage,
        ),
        task.mode,
        task.aspectRatio,
        task.prompt,
      )
    },
    [ensurePolling, patchTask, submitQueued],
  )

  const start = useCallback(
    (taskId: string) => startWith(taskId, ['ready', 'failed']),
    [startWith],
  )

  // Batch retry: resubmit every failed image of the task at once.
  const retryFailed = useCallback(
    (taskId: string) => startWith(taskId, ['failed']),
    [startWith],
  )

  const retryImage = useCallback(
    async (taskId: string, imgId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId)
      const img = task?.images.find((x) => x.id === imgId)
      if (!task || !img || img.status !== 'failed') return
      patchTask(taskId, (t) => ({
        ...t,
        running: true,
        startedAt: t.running ? t.startedAt : Date.now(),
        finishedAt: undefined,
        images: t.images.map((x) =>
          x.id === imgId
            ? { ...x, status: 'processing', attempts: 0, taskId: '', progress: 0, resultUrl: '', error: '' }
            : x,
        ),
      }))
      ensurePolling()
      await submitQueued(
        taskId,
        [
          {
            ...img,
            status: 'processing',
            attempts: 0,
            taskId: '',
            progress: 0,
            resultUrl: '',
            error: '',
          },
        ],
        task.mode,
        task.aspectRatio,
        task.prompt,
      )
    },
    [ensurePolling, patchTask, submitQueued],
  )

  // Batch download: pack every finished image into a single zip so the
  // browser's multi-download blocking cannot drop files.
  const [zipping, setZipping] = useState(false)
  const downloadAll = useCallback(async (taskId: string) => {
    const task = tasksRef.current.find((t) => t.id === taskId)
    if (!task) return
    const done = task.images.filter((x) => x.status === 'done' && x.resultUrl)
    if (!done.length) return
    setZipping(true)
    try {
      const zip = new JSZip()
      const blobs = await Promise.all(
        done.map(async (img) => {
          try {
            return await (await fetch(img.resultUrl)).blob()
          } catch {
            return null
          }
        }),
      )
      const used = new Set<string>()
      const failed: WmImage[] = []
      done.forEach((img, i) => {
        const blob = blobs[i]
        if (!blob) {
          failed.push(img)
          return
        }
        let name = img.name || `image-${i + 1}.png`
        if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) name += '.png'
        while (used.has(name)) name = `${i + 1}-${name}`
        used.add(name)
        zip.file(name, blob)
      })
      const out = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = url
      a.download = `${task.name}.zip`
      a.click()
      URL.revokeObjectURL(url)
      // Any image whose blob could not be fetched is opened directly instead.
      for (const img of failed) window.open(img.resultUrl, '_blank', 'noreferrer')
    } finally {
      setZipping(false)
    }
  }, [])

  // Ticks once per second while any task runs so elapsed timers update.
  const [now, setNow] = useState(() => Date.now())
  const anyRunning = tasks.some((t) => t.running)
  useEffect(() => {
    if (!anyRunning) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [anyRunning])

  // Resume polling for tasks that were still running before a reload.
  useEffect(() => {
    if (tasksRef.current.some((t) => t.running)) ensurePolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensurePolling])

  useEffect(() => {
    saveTasks(feature, tasks)
  }, [feature, tasks])

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  if (!active) return null

  const doneCount = active.images.filter((x) => x.status === 'done').length
  const failedCount = active.images.filter((x) => x.status === 'failed').length
  const pendingCount = active.images.filter(
    (x) => x.status === 'ready' || x.status === 'failed',
  ).length
  const activeProgress = taskProgress(active)

  return (
    <div className="wm-layout">
      <aside className="wm-sidebar">
        <button className="primary full" onClick={newTask}>
          ＋ 新建任务
        </button>
        <div className="wm-task-list">
          {tasks.map((t) => {
            const p = taskProgress(t)
            const done = t.images.filter((x) => x.status === 'done').length
            return (
              <div
                role="button"
                tabIndex={0}
                key={t.id}
                className={`wm-task ${t.id === active.id ? 'on' : ''}`}
                onClick={() => setActiveId(t.id)}
                onKeyDown={(e) => e.key === 'Enter' && setActiveId(t.id)}
              >
                <div className="wm-task-head">
                  <strong>{t.name}</strong>
                  {!t.running && (
                    <button
                      className="wm-task-del"
                      title="删除任务"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTask(t.id)
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="wm-task-meta">
                  {t.images.length ? `${done}/${t.images.length} 张完成` : '空任务'}
                  {t.startedAt && <span className="wm-task-time">用时 {taskElapsed(t, now)}</span>}
                  {t.running && <span className="wm-task-live">进行中</span>}
                </div>
                {t.images.length > 0 && (
                  <div className="wm-bar">
                    <div className="wm-bar-fill" style={{ width: `${p}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>

      <section className="wm-main">
        {error && <div className="error-bar">{error}</div>}
        <div className="wm-toolbar">
          <div className="wm-stats">
            <strong>{active.name}</strong>
            <span>
              共 <b>{active.images.length}</b> 张
            </span>
            {doneCount > 0 && <span className="wm-stat-done">完成 {doneCount}</span>}
            {failedCount > 0 && <span className="wm-stat-failed">失败 {failedCount}</span>}
            {active.startedAt && (
              <span className="wm-stat-time">用时 {taskElapsed(active, now)}</span>
            )}
          </div>
          <div className="wm-actions">
            <label className="wm-aspect">
              <span>出图比例</span>
              <select
                value={active.aspectRatio}
                disabled={active.running}
                onChange={(e) =>
                  patchTask(active.id, (t) => ({ ...t, aspectRatio: e.target.value }))
                }
              >
                {ASPECT_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value || 'source'}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary" onClick={() => inputRef.current?.click()} disabled={active.running}>
              添加图片
            </button>
            {doneCount > 0 && (
              <button
                className="secondary"
                disabled={zipping}
                onClick={() => void downloadAll(active.id)}
              >
                {zipping ? '打包中…' : `下载全部 · ${doneCount} 张`}
              </button>
            )}
            {!active.running && failedCount > 0 && (
              <button className="secondary wm-retry-all" onClick={() => void retryFailed(active.id)}>
                重试失败 · {failedCount} 张
              </button>
            )}
            <button
              className="primary big"
              onClick={() => void start(active.id)}
              disabled={active.running || pendingCount === 0}
            >
              {active.running ? `处理中… ${activeProgress}%` : `${text.action} · ${pendingCount} 张`}
            </button>
          </div>
        </div>

        <label className="wm-prompt">
          <span>自定义需求（可选）</span>
          <textarea
            value={active.prompt}
            maxLength={2000}
            rows={2}
            disabled={active.running}
            placeholder={text.promptPlaceholder}
            onChange={(e) => patchTask(active.id, (t) => ({ ...t, prompt: e.target.value }))}
          />
          <small>{active.prompt.length}/2000</small>
        </label>

        {active.running && (
          <div className="wm-progress-row">
            <div className="wm-bar big">
              <div className="wm-bar-fill" style={{ width: `${activeProgress}%` }} />
            </div>
            <span className="wm-progress-num">{activeProgress}%</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(active.id, e.target.files)
            e.target.value = ''
          }}
        />

        {active.images.length === 0 ? (
          <div
            className="wm-dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void addFiles(active.id, e.dataTransfer.files)
            }}
          >
            <div className="wm-drop-icon">⇪</div>
            <h3>{text.dropTitle}</h3>
            <p>
              一次最多 {MAX_FILES} 张 · {RESTORE_SUBMIT_CONCURRENCY} 路并发 · 失败自动重试（最多 {MAX_ATTEMPTS} 次）
              <br />
              {text.dropHint}
            </p>
          </div>
        ) : (
          <div
            className="wm-grid"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void addFiles(active.id, e.dataTransfer.files)
            }}
          >
            {active.images.map((x) => (
              <figure className={`wm-card st-${x.status}`} key={x.id}>
                <div className="wm-thumb">
                  <img src={x.resultUrl || x.dataUrl} alt={x.name} loading="lazy" decoding="async" />
                  {x.status === 'processing' && (
                    <div className="wm-mask">
                      <span className="spinner" />
                      <em>{x.progress > 0 ? `${Math.min(x.progress, 99)}%` : '排队中'}</em>
                      {x.attempts > 1 && <em>第 {x.attempts} 次尝试</em>}
                    </div>
                  )}
                  {x.status === 'failed' && (
                    <button
                      className="wm-retry-corner"
                      title="重试这张图片"
                      onClick={() => void retryImage(active.id, x.id)}
                    >
                      ↻
                    </button>
                  )}
                  {!active.running && x.status === 'ready' && (
                    <button className="wm-del" title="移除" onClick={() => removeImage(active.id, x.id)}>
                      ×
                    </button>
                  )}
                </div>
                {x.status === 'processing' && (
                  <div className="wm-bar flat">
                    <div className="wm-bar-fill" style={{ width: `${Math.min(x.progress, 99)}%` }} />
                  </div>
                )}
                <figcaption>
                  <span className="wm-name" title={x.name}>
                    {x.name}
                  </span>
                  <span className={`wm-status st-${x.status}`} title={x.error || undefined}>
                    {x.status === 'processing'
                      ? `处理中 ${Math.min(x.progress, 99)}%`
                      : STATUS_LABEL[x.status]}
                  </span>
                </figcaption>
                {x.status === 'done' && x.resultUrl && (
                  <a className="download" href={x.resultUrl} target="_blank" rel="noreferrer" download>
                    下载
                  </a>
                )}
                {x.status === 'failed' && (
                  <button className="secondary wm-retry" onClick={() => void retryImage(active.id, x.id)}>
                    重试
                  </button>
                )}
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
