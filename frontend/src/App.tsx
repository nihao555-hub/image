import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  fetchResults,
  fetchTemplates,
  generateImages,
  generatePrompts,
  type GenerateJob,
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
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [quality, setQuality] = useState('high')
  const [items, setItems] = useState<BatchItem[]>([newItem()])
  const [activeItemId, setActiveItemId] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [tasks, setTasks] = useState<TrackedTask[]>([])
  const [results, setResults] = useState<Record<string, TaskResult>>({})
  const [error, setError] = useState('')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    fetchTemplates()
      .then((t) => {
        setTemplates(t)
        setSelectedIds(new Set([t[0]?.id].filter(Boolean) as string[]))
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (items.length && !items.find((i) => i.id === activeItemId)) {
      setActiveItemId(items[0].id)
    }
  }, [items, activeItemId])

  const activeItem = items.find((i) => i.id === activeItemId) || items[0]

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

  const onUpload = (id: string, file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      updateItem(id, { imageDataUrl: reader.result as string })
    }
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
      )
      updateItem(item.id, { prompts: { ...item.prompts, ...prompts }, loadingPrompts: false })
    } catch (e) {
      setError(String(e))
      updateItem(item.id, { loadingPrompts: false })
    }
  }

  const startPolling = (tracked: TrackedTask[]) => {
    if (pollRef.current) window.clearInterval(pollRef.current)
    const poll = async () => {
      const pending = tracked
        .map((t) => t.taskId)
        .filter((id) => {
          const r = results[id]
          return !r || (r.status !== 'succeeded' && r.status !== 'failed' && r.status !== 'error')
        })
      const idsToPoll = tracked.map((t) => t.taskId)
      try {
        const res = await fetchResults(idsToPoll)
        setResults((prev) => ({ ...prev, ...res }))
        const allDone = tracked.every((t) => {
          const r = res[t.taskId]
          return r && (r.status === 'succeeded' || r.status === 'failed' || r.status === 'error')
        })
        if (allDone) {
          if (pollRef.current) window.clearInterval(pollRef.current)
          pollRef.current = null
          setGenerating(false)
        }
      } catch {
        // keep polling
      }
      void pending
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
    const tracked: TrackedTask[] = []
    for (const item of items) {
      for (const tid of selectedIds) {
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
    try {
      const taskInfos = await generateImages(jobs)
      // Map returned tasks back to their jobs by order.
      let idx = 0
      for (const item of items) {
        for (const tid of selectedIds) {
          const info = taskInfos[idx]
          if (info) {
            tracked.push({
              taskId: info.task_id,
              itemId: item.id,
              itemName: item.name,
              templateId: tid,
              templateName: templateName(tid),
            })
          }
          idx++
        }
      }
      setTasks(tracked)
      startPolling(tracked)
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">✦</span>
          <div>
            <h1>AI 电商套图生成器</h1>
            <p>上传商品图 · 选择套图类型 · 一键生成整套精美电商图</p>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="quality">
            画质
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="auto">自动</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <button
            className="primary big"
            disabled={generating || templates.length === 0}
            onClick={generateAll}
          >
            {generating ? '生成中…' : `生成套图 (${totalJobs} 张)`}
          </button>
        </div>
      </header>

      {error && <div className="error-bar">{error}</div>}

      <div className="layout">
        {/* LEFT: parameters */}
        <aside className="panel left">
          <div className="panel-head">
            <h2>参数设置</h2>
            <span className="hint">当前编辑：{activeItem?.name}</span>
          </div>
          {activeItem && (
            <div className="form">
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
              <Field label="其他要求">
                <textarea
                  rows={3}
                  value={activeItem.product.extra}
                  placeholder="补充描述、卖点、色调等"
                  onChange={(e) => updateProduct(activeItem.id, { extra: e.target.value })}
                />
              </Field>
              <button
                className="secondary full"
                disabled={activeItem.loadingPrompts}
                onClick={() => aiGenerate(activeItem)}
              >
                {activeItem.loadingPrompts ? 'AI 生成中…' : '✨ AI 生成完整提示词'}
              </button>

              {selectedIds.size > 0 && (
                <div className="prompts">
                  <h3>提示词（可编辑）</h3>
                  {Array.from(selectedIds).map((tid) => (
                    <div className="prompt-item" key={tid}>
                      <label>{templateName(tid)}</label>
                      <textarea
                        rows={3}
                        value={activeItem.prompts[tid] || ''}
                        placeholder="点击上方 AI 生成，或手动输入英文提示词"
                        onChange={(e) =>
                          updateItem(activeItem.id, {
                            prompts: { ...activeItem.prompts, [tid]: e.target.value },
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

        {/* CENTER: uploads / batch */}
        <main className="panel center">
          <div className="panel-head">
            <h2>商品图片（支持批量）</h2>
            <button className="secondary" onClick={() => setItems((p) => [...p, newItem()])}>
              + 添加商品
            </button>
          </div>
          <div className="items">
            {items.map((item) => (
              <div
                className={`item-card ${item.id === activeItemId ? 'active' : ''}`}
                key={item.id}
                onClick={() => setActiveItemId(item.id)}
              >
                <div className="item-top">
                  <input
                    className="item-name"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {items.length > 1 && (
                    <button
                      className="icon-btn"
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation()
                        setItems((p) => p.filter((x) => x.id !== item.id))
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <label className="dropzone">
                  {item.imageDataUrl ? (
                    <img src={item.imageDataUrl} alt="preview" />
                  ) : (
                    <span>点击上传图片</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onUpload(item.id, f)
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          {/* RESULTS */}
          <div className="panel-head" style={{ marginTop: 24 }}>
            <h2>生成结果</h2>
          </div>
          {tasks.length === 0 && <p className="empty">尚未生成，配置好参数后点击右上角「生成套图」。</p>}
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
                    ) : r?.status === 'failed' || r?.status === 'error' ? (
                      <div className="result-fail">失败：{r.failure_reason || r.error || '未知错误'}</div>
                    ) : (
                      <div className="result-loading">
                        <div className="spinner" />
                        <span>{r?.progress ? `${r.progress}%` : '排队中…'}</span>
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

        {/* RIGHT: template types */}
        <aside className="panel right">
          <div className="panel-head">
            <h2>套图类型</h2>
            <span className="hint">已选 {selectedIds.size}</span>
          </div>
          <div className="template-list">
            {templates.map((t) => (
              <button
                key={t.id}
                className={`template-card ${selectedIds.has(t.id) ? 'sel' : ''}`}
                onClick={() => toggleTemplate(t.id)}
              >
                <div className="tc-check">{selectedIds.has(t.id) ? '✓' : ''}</div>
                <div className="tc-body">
                  <div className="tc-name">{t.name}</div>
                  <div className="tc-en">{t.en}</div>
                </div>
                <div className="tc-ratio">{t.aspectRatio.replace('x', '×')}</div>
              </button>
            ))}
          </div>
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
