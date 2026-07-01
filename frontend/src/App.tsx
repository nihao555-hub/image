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
]

const emptyProduct = (): ProductInfo => ({
  name: '',
  category: '',
  style: '',
  background: '',
  extra: '',
})

let itemCounter = 1
const newItem = (): BatchItem => ({
  id: `item-${itemCounter++}-${Date.now()}`,
  name: `商品 ${itemCounter - 1}`,
  imageDataUrl: null,
  product: emptyProduct(),
  prompts: {},
  loadingPrompts: false,
})

function App() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [platformId, setPlatformId] = useState('amazon')
  const [language, setLanguage] = useState('en')
  const [density, setDensity] = useState('clean')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [quality, setQuality] = useState('high')
  const [items, setItems] = useState<BatchItem[]>([newItem()])
  const [activeItemId, setActiveItemId] = useState<string>('')
  const [view, setView] = useState<'setup' | 'results'>('setup')
  const [generating, setGenerating] = useState(false)
  const [tasks, setTasks] = useState<TrackedTask[]>([])
  const [results, setResults] = useState<Record<string, TaskResult>>({})
  const [badExamples, setBadExamples] = useState<Set<string>>(new Set())
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
          setSelectedIds(new Set(amazon.templates))
          setLanguage(amazon.language)
          setDensity(amazon.textDensity)
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
  const platform = platforms.find((p) => p.id === platformId)

  const templatesByCat = useMemo(() => {
    const map: Record<string, Template[]> = {}
    for (const t of templates) {
      ;(map[t.category] ||= []).push(t)
    }
    return map
  }, [templates])

  const applyPlatform = (id: string) => {
    setPlatformId(id)
    const p = platforms.find((x) => x.id === id)
    if (p) {
      setSelectedIds(new Set(p.templates))
      setLanguage(p.language)
      setDensity(p.textDensity)
    }
  }

  const updateItem = (id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }
  const updateProduct = (id: string, patch: Partial<ProductInfo>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, product: { ...it.product, ...patch } } : it)),
    )
  }

  const toggleTemplate = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelectedIds(new Set(templates.map((t) => t.id)))
  const clearAll = () => setSelectedIds(new Set())

  const onUpload = (id: string, file: File) => {
    const reader = new FileReader()
    reader.onload = () => updateItem(id, { imageDataUrl: reader.result as string })
    reader.readAsDataURL(file)
  }

  const templateName = (tid: string) => templates.find((t) => t.id === tid)?.name || tid

  const aiGenerate = async (item: BatchItem) => {
    if (selectedIds.size === 0) {
      setError('请先在右侧选择至少一种套图类型')
      return
    }
    setError('')
    updateItem(item.id, { loadingPrompts: true })
    try {
      const prompts = await generatePrompts(
        item.product,
        Array.from(selectedIds),
        !!item.imageDataUrl,
        platformId,
        language,
        density,
        item.imageDataUrl,
      )
      updateItem(item.id, { prompts: { ...item.prompts, ...prompts }, loadingPrompts: false })
    } catch (e) {
      setError(String(e))
      updateItem(item.id, { loadingPrompts: false })
    }
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
      }
    }
    void poll()
    pollRef.current = window.setInterval(poll, 4000)
  }

  const generateAll = async () => {
    if (selectedIds.size === 0) {
      setError('请先选择至少一种套图类型')
      return
    }
    setError('')
    const jobs: GenerateJob[] = []
    const orderedSel = templates.map((t) => t.id).filter((id) => selectedIds.has(id))
    for (const item of items) {
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
      let idx = 0
      for (const item of items) {
        for (const tid of orderedSel) {
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
          idx++
        }
      }
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

  const totalJobs = items.length * selectedIds.size
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
        <button className="item-tab add" onClick={() => setItems((p) => [...p, newItem()])}>
          <span className="ph">+</span>
          <em>添加商品</em>
        </button>
      </div>

      {activeItem && (
        <div className="form">
          <div className="field">
            <label>商品参考图</label>
            <label className="ref-dropzone">
              {activeItem.imageDataUrl ? (
                <img src={activeItem.imageDataUrl} alt="preview" />
              ) : (
                <span>点击上传商品图<br />作为生图参考</span>
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
          <button
            className="secondary full"
            disabled={activeItem.loadingPrompts}
            onClick={() => aiGenerate(activeItem)}
          >
            {activeItem.loadingPrompts ? 'AI 生成中…' : 'AI 生成完整提示词'}
          </button>

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
                        <span className={`txt-badge lv-${t.textLevel}`}>
                          {TEXT_LEVEL_LABEL[t.textLevel]}
                        </span>
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
          <span className="gc-check">{sel ? '选' : ''}</span>
          {TEXT_LEVEL_LABEL[t.textLevel] && (
            <span className={`gc-txt lv-${t.textLevel}`}>{TEXT_LEVEL_LABEL[t.textLevel]}</span>
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
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.region}）
                </option>
              ))}
            </select>
          </label>
          <label className="sel-field">
            文字语言
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="sel-field">
            信息密度
            <select value={density} onChange={(e) => setDensity(e.target.value)}>
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
          <b>{platform.name}</b>
          <span>推荐 {platform.templates.length} 张一套</span>
          <span>导出 {platform.size}</span>
          <span className={`density-tag d-${density}`}>
            {DENSITIES.find((d) => d.id === density)?.name}
          </span>
          <span className="pnote">{platform.note}</span>
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
                      <span className={`txt-badge lv-${t.textLevel}`}>
                        {TEXT_LEVEL_LABEL[t.textLevel]}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
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

export default App
