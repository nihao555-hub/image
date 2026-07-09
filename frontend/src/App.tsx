import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  fetchPlatforms,
  fetchResults,
  fetchTemplates,
  generateImages,
  generatePrompts,
  type Category,
  type GenerateJob,
  type Platform,
  type ProductInfo,
  type TaskResult,
  type Template,
} from './api'

interface BatchItem {
  id: string
  name: string
  imageDataUrl: string | null
  product: ProductInfo
  prompts: Record<string, string>
  loadingPrompts: boolean
  // Per-product configuration (each product can target a different platform /
  // language / density and pick its own set of image types).
  platformId: string
  language: string
  density: string
  selectedIds: string[]
}

interface HistoryImage {
  label: string
  url: string
}

interface HistoryEntry {
  id: string
  ts: number
  title: string
  images: HistoryImage[]
}

const HISTORY_KEY = 'ecom_image_history'
const HISTORY_MAX = 40

const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

interface TrackedTask {
  taskId: string
  itemId: string
  itemName: string
  templateId: string
  templateName: string
  job: GenerateJob
  attempts: number
}

const MAX_ATTEMPTS = 3

const DENSITIES: { id: string; name: string }[] = [
  { id: 'clean', name: '简洁少字' },
  { id: 'balanced', name: '均衡' },
  { id: 'rich', name: '富信息' },
]

const TEXT_LEVEL_LABEL: Record<string, string> = {
  light: '少量文字',
  rich: '富信息',
}

const LANGUAGES: { id: string; name: string }[] = [
  { id: 'zh', name: '简体中文' },
  { id: 'en', name: 'English' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'pt', name: 'Português' },
  { id: 'th', name: 'ไทย' },
  { id: 'id', name: 'Bahasa' },
  { id: 'vi', name: 'Tiếng Việt' },
  { id: 'ar', name: 'العربية' },
  { id: 'pl', name: 'Polski' },
  { id: 'nl', name: 'Nederlands' },
  { id: 'it', name: 'Italiano' },
  { id: 'ru', name: 'Русский' },
  { id: 'tr', name: 'Türkçe' },
  { id: 'hi', name: 'हिन्दी' },
]

// Category presets: each surfaces a set of structured spec keys relevant to
// that product type. Selecting a preset pre-fills the spec rows (still fully
// editable) so the info feeds spec-table / parameter templates cleanly.
const CATEGORY_TYPES: { id: string; name: string; keys: string[] }[] = [
  { id: 'general', name: '通用', keys: [] },
  { id: 'apparel', name: '服饰', keys: ['尺码', '材质', '颜色', '适用人群', '版型'] },
  { id: 'digital', name: '数码', keys: ['规格', '接口', '续航', '重量', '兼容性'] },
  { id: 'beauty', name: '美妆', keys: ['容量', '成分', '功效', '适用肤质', '产地'] },
  { id: 'home', name: '家居', keys: ['尺寸', '材质', '容量', '重量', '保养'] },
  { id: 'food', name: '食品', keys: ['净含量', '口味', '配料', '保质期', '储存方式'] },
]

const emptyProduct = (): ProductInfo => ({
  name: '',
  category: '',
  style: '',
  background: '',
  extra: '',
  categoryType: 'general',
  sku: '',
  variants: '',
  specs: [],
})

let itemCounter = 1
const newItem = (cfg?: {
  platformId: string
  language: string
  density: string
  selectedIds: string[]
}): BatchItem => ({
  id: `item-${itemCounter++}-${Date.now()}`,
  name: `商品 ${itemCounter - 1}`,
  imageDataUrl: null,
  product: emptyProduct(),
  prompts: {},
  loadingPrompts: false,
  platformId: cfg?.platformId ?? 'amazon',
  language: cfg?.language ?? 'en',
  density: cfg?.density ?? 'clean',
  selectedIds: cfg?.selectedIds ? [...cfg.selectedIds] : [],
})

function App() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [quality, setQuality] = useState('high')
  const [items, setItems] = useState<BatchItem[]>([newItem()])
  const [activeItemId, setActiveItemId] = useState<string>('')
  const [view, setView] = useState<'setup' | 'results'>('setup')
  const [generating, setGenerating] = useState(false)
  const [tasks, setTasks] = useState<TrackedTask[]>([])
  const [results, setResults] = useState<Record<string, TaskResult>>({})
  const [badExamples, setBadExamples] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<number | null>(null)
  const trackedRef = useRef<TrackedTask[]>([])

  useEffect(() => {
    fetchTemplates()
      .then((d) => {
        setTemplates(d.templates)
        setCategories(d.categories)
      })
      .catch((e) => setError(String(e)))
    fetchPlatforms()
      .then((p) => {
        setPlatforms(p)
        const amazon = p.find((x) => x.id === 'amazon') || p[0]
        if (amazon) {
          // Seed any product that has not picked its image types yet.
          setItems((prev) =>
            prev.map((it) =>
              it.selectedIds.length === 0
                ? {
                    ...it,
                    platformId: amazon.id,
                    language: amazon.language,
                    density: amazon.textDensity,
                    selectedIds: [...amazon.templates],
                  }
                : it,
            ),
          )
        }
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (items.length && !items.find((i) => i.id === activeItemId)) {
      setActiveItemId(items[0].id)
    }
  }, [items, activeItemId])

  const activeItem = items.find((i) => i.id === activeItemId) || items[0]
  // The active product's config drives the topbar selectors and the gallery.
  const platformId = activeItem?.platformId ?? 'amazon'
  const language = activeItem?.language ?? 'en'
  const density = activeItem?.density ?? 'clean'
  const selectedIds = useMemo(
    () => new Set(activeItem?.selectedIds ?? []),
    [activeItem?.selectedIds],
  )
  const platform = platforms.find((p) => p.id === platformId)

  // Group platforms by region (preserving backend order) for the dropdown.
  const platformGroups = useMemo<[string, Platform[]][]>(() => {
    const map = new Map<string, Platform[]>()
    for (const p of platforms) {
      const arr = map.get(p.region) ?? []
      arr.push(p)
      map.set(p.region, arr)
    }
    return Array.from(map.entries())
  }, [platforms])

  const templatesByCat = useMemo(() => {
    const map: Record<string, Template[]> = {}
    for (const t of templates) {
      ;(map[t.category] ||= []).push(t)
    }
    return map
  }, [templates])

  const updateItem = (id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }
  const updateProduct = (id: string, patch: Partial<ProductInfo>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, product: { ...it.product, ...patch } } : it)),
    )
  }

  // Switch a product's category preset; prefill spec rows from the preset keys
  // (kept only when the user has not already entered specs).
  const setCategoryType = (id: string, ctype: string) => {
    const preset = CATEGORY_TYPES.find((c) => c.id === ctype)
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const hasData = it.product.specs.some((s) => s.k || s.v)
        const specs =
          hasData || !preset || preset.keys.length === 0
            ? it.product.specs
            : preset.keys.map((k) => ({ k, v: '' }))
        return { ...it, product: { ...it.product, categoryType: ctype, specs } }
      }),
    )
  }
  const updateSpec = (id: string, i: number, patch: Partial<{ k: string; v: string }>) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              product: {
                ...it.product,
                specs: it.product.specs.map((s, j) => (j === i ? { ...s, ...patch } : s)),
              },
            }
          : it,
      ),
    )
  const addSpec = (id: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, product: { ...it.product, specs: [...it.product.specs, { k: '', v: '' }] } }
          : it,
      ),
    )
  const removeSpec = (id: string, i: number) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, product: { ...it.product, specs: it.product.specs.filter((_, j) => j !== i) } }
          : it,
      ),
    )

  // All config edits below apply to the currently active product only.
  const applyPlatform = (id: string) => {
    if (!activeItem) return
    const p = platforms.find((x) => x.id === id)
    updateItem(
      activeItem.id,
      p
        ? { platformId: id, selectedIds: [...p.templates], language: p.language, density: p.textDensity }
        : { platformId: id },
    )
  }

  const toggleTemplate = (id: string) => {
    if (!activeItem) return
    const cur = activeItem.selectedIds
    updateItem(activeItem.id, {
      selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    })
  }
  const selectAll = () =>
    activeItem && updateItem(activeItem.id, { selectedIds: templates.map((t) => t.id) })
  const clearAll = () => activeItem && updateItem(activeItem.id, { selectedIds: [] })

  const onUpload = (id: string, file: File) => {
    const reader = new FileReader()
    reader.onload = () => updateItem(id, { imageDataUrl: reader.result as string })
    reader.readAsDataURL(file)
  }

  const templateName = (tid: string) => templates.find((t) => t.id === tid)?.name || tid

  const aiGenerate = async (item: BatchItem) => {
    if (item.selectedIds.length === 0) {
      setError('请先为该商品选择至少一种套图类型')
      return
    }
    setError('')
    updateItem(item.id, { loadingPrompts: true })
    try {
      const prompts = await generatePrompts(
        item.product,
        item.selectedIds,
        !!item.imageDataUrl,
        item.platformId,
        item.language,
        item.density,
        item.imageDataUrl,
      )
      updateItem(item.id, { prompts: { ...item.prompts, ...prompts }, loadingPrompts: false })
    } catch (e) {
      setError(String(e))
      updateItem(item.id, { loadingPrompts: false })
    }
  }

  const aiGenerateAll = async () => {
    const targets = items.filter((it) => it.selectedIds.length > 0)
    if (targets.length === 0) {
      setError('请先为商品选择套图类型')
      return
    }
    setError('')
    setItems((prev) =>
      prev.map((it) => (it.selectedIds.length > 0 ? { ...it, loadingPrompts: true } : it)),
    )
    await Promise.all(
      targets.map(async (item) => {
        try {
          const prompts = await generatePrompts(
            item.product,
            item.selectedIds,
            !!item.imageDataUrl,
            item.platformId,
            item.language,
            item.density,
            item.imageDataUrl,
          )
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? { ...it, prompts: { ...it.prompts, ...prompts }, loadingPrompts: false }
                : it,
            ),
          )
        } catch (e) {
          setError(String(e))
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, loadingPrompts: false } : it)),
          )
        }
      }),
    )
  }

  const startPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current)
    const poll = async () => {
      const current = trackedRef.current
      if (!current.length) return
      let res: Record<string, TaskResult>
      try {
        res = await fetchResults(current.map((t) => t.taskId))
      } catch {
        return // transient error, keep polling
      }
      setResults((prev) => ({ ...prev, ...res }))

      // Auto-retry any failed image up to MAX_ATTEMPTS times.
      const toRetry = current.filter((t) => {
        const r = res[t.taskId]
        return (
          r &&
          (r.status === 'failed' || r.status === 'error') &&
          t.attempts < MAX_ATTEMPTS
        )
      })
      if (toRetry.length) {
        for (const t of toRetry) {
          let newTask: TrackedTask = { ...t, attempts: t.attempts + 1 }
          try {
            const [info] = await generateImages([t.job])
            if (info) {
              newTask = { ...newTask, taskId: info.task_id }
              setResults((prev) => ({
                ...prev,
                [info.task_id]: { status: 'retrying', progress: 0, results: [] },
              }))
            }
          } catch {
            // keep the failed task; it will retry again next cycle if attempts remain
          }
          trackedRef.current = trackedRef.current.map((x) => (x === t ? newTask : x))
        }
        setTasks(trackedRef.current)
        return // next cycle polls the resubmitted task ids
      }

      const allDone = trackedRef.current.every((t) => {
        const r = res[t.taskId]
        if (!r) return false
        if (r.status === 'succeeded') return true
        return (
          (r.status === 'failed' || r.status === 'error') && t.attempts >= MAX_ATTEMPTS
        )
      })
      if (allDone) {
        if (pollRef.current) window.clearInterval(pollRef.current)
        pollRef.current = null
        setGenerating(false)
        saveHistoryEntry(current, res)
      }
    }
    void poll()
    pollRef.current = window.setInterval(poll, 4000)
  }

  // Persist a completed batch (only successfully generated images) to the
  // history drawer so users can revisit past results across sessions.
  const saveHistoryEntry = (tracked: TrackedTask[], res: Record<string, TaskResult>) => {
    const images: HistoryImage[] = tracked
      .map((t) => {
        const url = res[t.taskId]?.results?.[0]?.url
        return url ? { label: `${t.itemName} · ${t.templateName}`, url } : null
      })
      .filter((x): x is HistoryImage => x !== null)
    if (images.length === 0) return
    const names = Array.from(new Set(tracked.map((t) => t.itemName)))
    const title =
      names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')} 等 ${names.length} 个商品`
    const entry: HistoryEntry = {
      id: `h-${Date.now()}`,
      ts: Date.now(),
      title: `${title} · ${images.length} 张`,
      images,
    }
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_MAX)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // storage full / unavailable — keep in-memory only
      }
      return next
    })
  }

  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      // ignore
    }
  }

  const generateAll = async () => {
    const totalSel = items.reduce((n, it) => n + it.selectedIds.length, 0)
    if (totalSel === 0) {
      setError('请先为商品选择至少一种套图类型')
      return
    }
    setError('')
    const jobs: GenerateJob[] = []
    // Each product uses its own selected image types, in gallery order.
    const plan: { item: BatchItem; tid: string }[] = []
    for (const item of items) {
      const orderedSel = templates.map((t) => t.id).filter((id) => item.selectedIds.includes(id))
      for (const tid of orderedSel) {
        const tpl = templates.find((t) => t.id === tid)
        const prompt =
          item.prompts[tid] ||
          `Professional e-commerce photo of ${item.product.name || 'the product'}. ${
            tpl?.guidance || ''
          }`
        jobs.push({
          template_id: tid,
          prompt,
          aspectRatio: tpl?.aspectRatio || '1024x1024',
          quality,
          image_base64: item.imageDataUrl,
          label: `${item.name} · ${tpl?.name || tid}`,
        })
        plan.push({ item, tid })
      }
    }
    if (jobs.length === 0) return
    setGenerating(true)
    setResults({})
    setTasks([])
    setView('results')
    try {
      const taskInfos = await generateImages(jobs)
      const tracked: TrackedTask[] = []
      plan.forEach(({ item, tid }, idx) => {
        const info = taskInfos[idx]
        const job = jobs[idx]
        if (info && job) {
          tracked.push({
            taskId: info.task_id,
            itemId: item.id,
            itemName: item.name,
            templateId: tid,
            templateName: templateName(tid),
            job,
            attempts: 1,
          })
        }
      })
      trackedRef.current = tracked
      setTasks(tracked)
      startPolling()
    } catch (e) {
      setError(String(e))
      setGenerating(false)
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  const totalJobs = items.reduce((n, it) => n + it.selectedIds.length, 0)
  const doneCount = tasks.filter((t) => results[t.taskId]?.status === 'succeeded').length

  const markBad = (id: string) =>
    setBadExamples((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  const renderParams = () => (
    <aside className="panel left">
      <div className="items-tabs">
        {items.map((item) => (
          <button
            key={item.id}
            className={`item-tab ${item.id === activeItemId ? 'active' : ''}`}
            onClick={() => setActiveItemId(item.id)}
          >
            {item.imageDataUrl ? <img src={item.imageDataUrl} alt="" /> : <span className="ph">+</span>}
            <em>{item.name}</em>
            {items.length > 1 && (
              <i
                className="del"
                title="删除商品"
                onClick={(e) => {
                  e.stopPropagation()
                  setItems((p) => p.filter((x) => x.id !== item.id))
                }}
              >
                ×
              </i>
            )}
          </button>
        ))}
        <button
          className="item-tab add"
          onClick={() =>
            setItems((p) => [
              ...p,
              newItem(
                activeItem
                  ? {
                      platformId: activeItem.platformId,
                      language: activeItem.language,
                      density: activeItem.density,
                      selectedIds: activeItem.selectedIds,
                    }
                  : undefined,
              ),
            ])
          }
        >
          <span className="ph">+</span>
          <em>添加商品</em>
        </button>
      </div>

      {activeItem && (
        <div className="form">
          <Section title="基本信息">
            <div className="field">
              <label>商品参考图</label>
              <label className="ref-dropzone">
                {activeItem.imageDataUrl ? (
                  <img src={activeItem.imageDataUrl} alt="preview" />
                ) : (
                  <span>
                    点击上传商品图
                    <br />
                    作为生图参考
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onUpload(activeItem.id, f)
                  }}
                />
              </label>
            </div>
            <Field label="商品名称">
              <input
                value={activeItem.product.name}
                placeholder="如：无线蓝牙耳机"
                onChange={(e) => updateProduct(activeItem.id, { name: e.target.value })}
              />
            </Field>
            <Field label="商品类目">
              <input
                value={activeItem.product.category}
                placeholder="如：数码 / 服饰 / 美妆"
                onChange={(e) => updateProduct(activeItem.id, { category: e.target.value })}
              />
            </Field>
          </Section>
          <Section title="规格与变体">
            <div className="field two">
              <Field label="SKU / 货号">
                <input
                  value={activeItem.product.sku}
                  placeholder="如：BT-500-BLK"
                  onChange={(e) => updateProduct(activeItem.id, { sku: e.target.value })}
                />
              </Field>
              <Field label="类目类型">
                <select
                  value={activeItem.product.categoryType}
                  onChange={(e) => setCategoryType(activeItem.id, e.target.value)}
                >
                  {CATEGORY_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="SKU 变体（多色 / 多规格，用逗号分隔）">
              <input
                value={activeItem.product.variants}
                placeholder="如：黑色, 白色, 天空蓝"
                onChange={(e) => updateProduct(activeItem.id, { variants: e.target.value })}
              />
            </Field>
            <div className="field">
              <label>
                规格参数
                <button className="tiny inline" onClick={() => addSpec(activeItem.id)}>
                  + 加一行
                </button>
              </label>
              {activeItem.product.specs.length === 0 && (
                <p className="spec-hint">选「类目类型」可自动带出常用参数，或手动添加</p>
              )}
              {activeItem.product.specs.map((s, i) => (
                <div className="spec-row" key={i}>
                  <input
                    className="spec-k"
                    value={s.k}
                    placeholder="参数名"
                    onChange={(e) => updateSpec(activeItem.id, i, { k: e.target.value })}
                  />
                  <input
                    className="spec-v"
                    value={s.v}
                    placeholder="参数值"
                    onChange={(e) => updateSpec(activeItem.id, i, { v: e.target.value })}
                  />
                  <button
                    className="spec-del"
                    title="删除"
                    onClick={() => removeSpec(activeItem.id, i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Section>
          <Section title="风格与要求">
            <Field label="风格">
              <input
                value={activeItem.product.style}
                placeholder="如：简约 / 高级 / 复古"
                onChange={(e) => updateProduct(activeItem.id, { style: e.target.value })}
              />
            </Field>
            <Field label="背景 / 场景">
              <input
                value={activeItem.product.background}
                placeholder="如：大理石台面 / 咖啡厅"
                onChange={(e) => updateProduct(activeItem.id, { background: e.target.value })}
              />
            </Field>
            <Field label="其他要求 / 卖点">
              <textarea
                rows={3}
                value={activeItem.product.extra}
                placeholder="补充描述、核心卖点、色调等"
                onChange={(e) => updateProduct(activeItem.id, { extra: e.target.value })}
              />
            </Field>
          </Section>
          <div className="ai-btns">
            <button
              className="secondary"
              disabled={activeItem.loadingPrompts}
              onClick={() => aiGenerate(activeItem)}
            >
              {activeItem.loadingPrompts ? 'AI 生成中…' : 'AI 生成提示词（本商品）'}
            </button>
            {items.length > 1 && (
              <button
                className="secondary"
                disabled={items.some((it) => it.loadingPrompts)}
                onClick={aiGenerateAll}
              >
                {items.some((it) => it.loadingPrompts)
                  ? 'AI 生成中…'
                  : `为全部 ${items.length} 个商品生成`}
              </button>
            )}
          </div>

          {selectedIds.size > 0 && (
            <div className="prompts">
              <h3>提示词（可编辑）</h3>
              {templates
                .filter((t) => selectedIds.has(t.id))
                .map((t) => (
                    <div className="prompt-item" key={t.id}>
                      <label>
                        {t.name}
                        {TEXT_LEVEL_LABEL[t.textLevel] && (
                          <span className="txt-badge">{TEXT_LEVEL_LABEL[t.textLevel]}</span>
                        )}
                      </label>
                    <textarea
                      rows={2}
                      value={activeItem.prompts[t.id] || ''}
                      placeholder="点击上方 AI 生成，或手动输入英文提示词"
                      onChange={(e) =>
                        updateItem(activeItem.id, {
                          prompts: { ...activeItem.prompts, [t.id]: e.target.value },
                        })
                      }
                    />
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </aside>
  )

  const renderGalleryCard = (t: Template) => {
    const sel = selectedIds.has(t.id)
    const showImg = !badExamples.has(t.id)
    return (
      <button
        key={t.id}
        className={`gallery-card ${sel ? 'sel' : ''}`}
        onClick={() => toggleTemplate(t.id)}
      >
        <div className="gc-thumb">
          {showImg ? (
            <img src={t.example} alt={t.name} onError={() => markBad(t.id)} />
          ) : (
            <div className="gc-fallback">{t.name.slice(0, 2)}</div>
          )}
          {sel && <span className="gc-check">✓</span>}
          {TEXT_LEVEL_LABEL[t.textLevel] && (
            <span className="gc-txt">{TEXT_LEVEL_LABEL[t.textLevel]}</span>
          )}
        </div>
        <div className="gc-name">{t.name}</div>
        <div className="gc-en">{t.en}</div>
      </button>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">AI</span>
          <div>
            <h1>AI 电商套图生成器</h1>
            <p>选平台 · 传商品图 · 一键生成整套合规电商图</p>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="sel-field">
            平台
            <select value={platformId} onChange={(e) => applyPlatform(e.target.value)}>
              {platformGroups.map(([region, ps]) => (
                <optgroup key={region} label={region}>
                  {ps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="sel-field">
            文字语言
            <select
              value={language}
              onChange={(e) => activeItem && updateItem(activeItem.id, { language: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sel-field">
            信息密度
            <select
              value={density}
              onChange={(e) => activeItem && updateItem(activeItem.id, { density: e.target.value })}
            >
              {DENSITIES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sel-field">
            画质
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="auto">自动</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          {view === 'results' && (
            <button className="ghost" onClick={() => setView('setup')}>
              ← 返回配置
            </button>
          )}
          <button
            className="ghost"
            onClick={() => setShowHistory((v) => !v)}
            title="查看历史生成记录"
          >
            历史记录{history.length > 0 ? ` (${history.length})` : ''}
          </button>
          <button
            className="primary big"
            disabled={generating || templates.length === 0}
            onClick={generateAll}
          >
            {generating ? `生成中… ${doneCount}/${totalJobs}` : `批量生成 · ${totalJobs} 张`}
          </button>
        </div>
      </header>

      {platform && (
        <div className="platform-bar">
          {activeItem && <span className="cur-item">当前商品：{activeItem.name}</span>}
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <b>{platform.name}</b>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span>已选 {selectedIds.size} 张</span>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span>导出 {platform.size}</span>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span className={`density-tag d-${density}`}>
            {DENSITIES.find((d) => d.id === density)?.name}
          </span>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span className="pnote" title={platform.note}>
            {platform.note}
          </span>
        </div>
      )}

      {error && <div className="error-bar">{error}</div>}

      <div className={`layout ${view}`}>
        {renderParams()}

        {view === 'results' && (
          <main className="panel center">
            <div className="panel-head">
              <h2>生成结果</h2>
              <span className="hint">
                {doneCount}/{tasks.length} 完成
              </span>
            </div>
            <div className="results-grid">
              {tasks.map((t) => {
                const r = results[t.taskId]
                const url = r?.results?.[0]?.url
                return (
                  <div className="result-card" key={t.taskId}>
                    <div className="result-caption">
                      <strong>{t.itemName}</strong>
                      <span>{t.templateName}</span>
                    </div>
                    <div className="result-body">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={t.templateName} />
                        </a>
                      ) : (r?.status === 'failed' || r?.status === 'error') &&
                        t.attempts >= MAX_ATTEMPTS ? (
                        <div className="result-fail">
                          失败（已重试 {t.attempts} 次）：
                          {r.failure_reason || r.error || '未知错误'}
                        </div>
                      ) : (
                        <div className="result-loading">
                          <div className="spinner" />
                          <span>
                            {r?.status === 'retrying' ||
                            r?.status === 'failed' ||
                            r?.status === 'error'
                              ? `重试中 ${t.attempts}/${MAX_ATTEMPTS}`
                              : r?.progress
                                ? `${r.progress}%`
                                : '排队中…'}
                          </span>
                        </div>
                      )}
                    </div>
                    {url && (
                      <a className="download" href={url} target="_blank" rel="noreferrer" download>
                        查看 / 下载
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          </main>
        )}

        {/* Template gallery: big in setup, compact list in results */}
        <aside className={`panel gallery ${view === 'results' ? 'compact' : ''}`}>
          <div className="panel-head">
            <h2>套图类型</h2>
            <div className="gallery-actions">
              <span className="hint">已选 {selectedIds.size}</span>
              {platform && (
                <button className="tiny" onClick={() => applyPlatform(platformId)}>
                  推荐套图
                </button>
              )}
              <button className="tiny" onClick={selectAll}>
                全选
              </button>
              <button className="tiny" onClick={clearAll}>
                清空
              </button>
            </div>
          </div>

          {view === 'setup' ? (
            <div className="gallery-scroll">
              {categories.map((c) => {
                const list = templatesByCat[c.id] || []
                if (!list.length) return null
                return (
                  <section className="gallery-cat" key={c.id}>
                    <h3>{c.name}</h3>
                    <div className="gallery-grid">{list.map(renderGalleryCard)}</div>
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="compact-list">
              {templates
                .filter((t) => selectedIds.has(t.id))
                .map((t) => (
                  <div className="compact-item" key={t.id}>
                    <span>{t.name}</span>
                    {TEXT_LEVEL_LABEL[t.textLevel] && (
                      <span className="txt-badge">{TEXT_LEVEL_LABEL[t.textLevel]}</span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>

      {showHistory && (
        <div className="history-overlay" onClick={() => setShowHistory(false)}>
          <aside className="history-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="history-head">
              <h2>历史记录</h2>
              <div className="history-head-actions">
                {history.length > 0 && (
                  <button className="tiny" onClick={clearHistory}>
                    清空
                  </button>
                )}
                <button className="tiny" onClick={() => setShowHistory(false)}>
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
                          <img src={img.url} alt={img.label} />
                        </a>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <div className="form-section-head">{title}</div>
      <div className="form-section-body">{children}</div>
    </section>
  )
}

export default App
