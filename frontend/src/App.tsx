import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  getAuth,
  setAuth,
  type AuthUser,
} from './api'
import { AuthPage } from './components/AuthPage'
import { GalleryCard } from './components/GalleryCard'
import { HistoryDrawer } from './components/HistoryDrawer'
import { ParamsPanel } from './components/ParamsPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { CATEGORY_TYPES, DENSITIES, LANGUAGES, MAX_ATTEMPTS, TEXT_LEVEL_LABEL } from './constants'
import { useHistory } from './hooks/useHistory'
import { WatermarkPage } from './components/WatermarkPage'
import { newItem, type BatchItem, type TrackedTask } from './types'

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getAuth())
  const [showApi, setShowApi] = useState(false)
  const [mode, setMode] = useState<'watermark' | 'upscale' | 'generate'>('watermark')
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
  const { history, addEntry, clearHistory } = useHistory()
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<number | null>(null)
  const trackedRef = useRef<TrackedTask[]>([])

  useEffect(() => {
    const onUnauth = () => setUser(null)
    window.addEventListener('tj-unauth', onUnauth)
    return () => window.removeEventListener('tj-unauth', onUnauth)
  }, [])

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

  const updateItem = useCallback((id: string, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])
  const updateProduct = useCallback((id: string, patch: Partial<ProductInfo>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, product: { ...it.product, ...patch } } : it)),
    )
  }, [])

  // Switch a product's category preset; prefill spec rows from the preset keys
  // (kept only when the user has not already entered specs).
  const setCategoryType = useCallback((id: string, ctype: string) => {
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
  }, [])
  const updateSpec = useCallback(
    (id: string, i: number, patch: Partial<{ k: string; v: string }>) =>
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
      ),
    [],
  )
  const addSpec = useCallback(
    (id: string) =>
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, product: { ...it.product, specs: [...it.product.specs, { k: '', v: '' }] } }
            : it,
        ),
      ),
    [],
  )
  const removeSpec = useCallback(
    (id: string, i: number) =>
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                product: { ...it.product, specs: it.product.specs.filter((_, j) => j !== i) },
              }
            : it,
        ),
      ),
    [],
  )
  const removeItem = useCallback(
    (id: string) => setItems((p) => p.filter((x) => x.id !== id)),
    [],
  )
  const readFiles = useCallback(async (files: File[]) => {
    const load = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error || new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
    return Promise.all(files.map((file) => load(file)))
  }, [])
  const addItem = useCallback(() => {
    setItems((p) => {
      const cur = p.find((x) => x.id === activeItemId) || p[0]
      return [
        ...p,
        newItem(
          cur
            ? {
                platformId: cur.platformId,
                language: cur.language,
                density: cur.density,
                selectedIds: cur.selectedIds,
              }
            : undefined,
        ),
      ]
    })
  }, [activeItemId])

  const batchCreate = useCallback(
    async (files: File[]) => {
      if (!files.length) return
      const images = await readFiles(files)
      const base = activeItem
        ? {
            platformId: activeItem.platformId,
            language: activeItem.language,
            density: activeItem.density,
            selectedIds: activeItem.selectedIds,
          }
        : undefined
      const item = newItem({ ...base, images })
      setItems((prev) => [...prev, item])
      setActiveItemId(item.id)
    },
    [activeItem, readFiles],
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

  const toggleTemplate = useCallback(
    (id: string) => {
      setItems((prev) => {
        const active = prev.find((i) => i.id === activeItemId) || prev[0]
        if (!active) return prev
        const cur = active.selectedIds
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
        return prev.map((it) => (it.id === active.id ? { ...it, selectedIds: next } : it))
      })
    },
    [activeItemId],
  )
  const selectAll = () =>
    activeItem && updateItem(activeItem.id, { selectedIds: templates.map((t) => t.id) })
  const clearAll = () => activeItem && updateItem(activeItem.id, { selectedIds: [] })

  const onUpload = useCallback(
    async (id: string, files: File[]) => {
      if (!files.length) return
      const images = await readFiles(files)
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, images: [...it.images, ...images] } : it,
        ),
      )
    },
    [readFiles],
  )
  const removeImage = useCallback((id: string, index: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, images: it.images.filter((_, i) => i !== index) } : it,
      ),
    )
  }, [])

  const templateName = (tid: string) => templates.find((t) => t.id === tid)?.name || tid

  const aiGenerate = useCallback(
    async (item: BatchItem) => {
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
          item.images.length > 0,
          item.platformId,
          item.language,
          item.density,
          item.images[0] ?? null,
        )
        updateItem(item.id, { prompts: { ...item.prompts, ...prompts }, loadingPrompts: false })
      } catch (e) {
        setError(String(e))
        updateItem(item.id, { loadingPrompts: false })
      }
    },
    [updateItem],
  )

  const aiGenerateAll = useCallback(async () => {
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
            item.images.length > 0,
            item.platformId,
            item.language,
            item.density,
            item.images[0] ?? null,
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
  }, [items])

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
        addEntry(current, res)
      }
    }
    void poll()
    pollRef.current = window.setInterval(poll, 4000)
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
          image_base64: item.images[0] ?? null,
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

  const markBad = useCallback(
    (id: string) => setBadExamples((prev) => (prev.has(id) ? prev : new Set(prev).add(id))),
    [],
  )

  if (!user) {
    return <AuthPage onAuth={setUser} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
              <path d="m21 15-4.2-4.2a1.5 1.5 0 0 0-2.1 0L7 18.5" />
            </svg>
          </span>
          <div>
            <h1>图匠</h1>
            <p>电商图片工作台 · 批量去水印 / 超清 / 套图生成</p>
          </div>
        </div>
        <nav className="mode-tabs" aria-label="功能切换">
          <button
            className={mode === 'watermark' ? 'on' : ''}
            onClick={() => setMode('watermark')}
          >
            批量去水印
          </button>
          <button
            className={mode === 'upscale' ? 'on' : ''}
            onClick={() => setMode('upscale')}
          >
            超清图片
          </button>
          <button
            className={mode === 'generate' ? 'on' : ''}
            onClick={() => setMode('generate')}
          >
            套图生成
          </button>
        </nav>
        <div className="user-menu">
          <span className="user-email" title={user.email}>
            {user.email}
          </span>
          <button className="ghost" onClick={() => setShowApi((v) => !v)}>
            API 接口
          </button>
          <button
            className="ghost"
            onClick={() => {
              setAuth(null)
              setUser(null)
            }}
          >
            退出
          </button>
        </div>
        {mode === 'generate' && (
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
        )}
      </header>

      {showApi && (
        <div className="api-panel">
          <div className="api-panel-head">
            <h3>API 接口</h3>
            <button className="ghost" onClick={() => setShowApi(false)}>
              关闭
            </button>
          </div>
          <p>
            用下面的 API Key 可直接调用去水印 / 超清接口（请求头{' '}
            <code>Authorization: Bearer 你的Key</code>）：
          </p>
          <pre className="api-key">{user.api_key}</pre>
          <pre className="api-example">{`# 提交去水印（超清把 watermark 换成 upscale）
curl -X POST https://ecom-image-api.onrender.com/api/watermark \\
  -H "Authorization: Bearer ${user.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"image_base64": "data:image/png;base64,...."}'
# 返回 {"task_id": "..."}，然后轮询结果：
curl -X POST https://ecom-image-api.onrender.com/api/result \\
  -H "Authorization: Bearer ${user.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"ids": ["task_id"]}'`}</pre>
        </div>
      )}

      {/* Both restore pages stay mounted so their polling keeps running
          when the user switches to another feature tab. */}
      <div style={{ display: mode === 'watermark' ? 'contents' : 'none' }}>
        <WatermarkPage feature="watermark" />
      </div>
      <div style={{ display: mode === 'upscale' ? 'contents' : 'none' }}>
        <WatermarkPage feature="upscale" />
      </div>

      {mode === 'generate' && platform && (
        <div className="platform-bar">
          {activeItem && <span className="cur-item">当前图片库：{activeItem.name}</span>}
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

      {mode === 'generate' && error && <div className="error-bar">{error}</div>}

      {mode === 'generate' && (
      <div className={`layout ${view}`}>
        <ParamsPanel
          items={items}
          activeItem={activeItem}
          activeItemId={activeItemId}
          templates={templates}
          selectedIds={selectedIds}
          onSelectItem={setActiveItemId}
          onRemoveItem={removeItem}
          onAddItem={addItem}
          onBatchCreate={batchCreate}
          onUpload={onUpload}
          onRemoveImage={removeImage}
          onUpdateItem={updateItem}
          onUpdateProduct={updateProduct}
          onSetCategoryType={setCategoryType}
          onAddSpec={addSpec}
          onUpdateSpec={updateSpec}
          onRemoveSpec={removeSpec}
          onAiGenerate={aiGenerate}
          onAiGenerateAll={aiGenerateAll}
        />

        {view === 'results' && (
          <ResultsPanel tasks={tasks} results={results} doneCount={doneCount} />
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
                    <div className="gallery-grid">
                      {list.map((t) => (
                        <GalleryCard
                          key={t.id}
                          template={t}
                          selected={selectedIds.has(t.id)}
                          showImg={!badExamples.has(t.id)}
                          onToggle={toggleTemplate}
                          onImgError={markBad}
                        />
                      ))}
                    </div>
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
      )}

      {showHistory && (
        <HistoryDrawer
          history={history}
          onClear={clearHistory}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}

export default App
