import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProductInfo, Template } from '../api'
import { CATEGORY_TYPES, TEXT_LEVEL_LABEL } from '../constants'
import type { BatchItem } from '../types'
import { emptyProduct } from '../types'
import { Field } from './Field'

interface Props {
  items: BatchItem[]
  activeItem: BatchItem | undefined
  activeItemId: string
  templates: Template[]
  selectedIds: Set<string>
  onSelectItem: (id: string) => void
  onRemoveItem: (id: string) => void
  onAddItem: () => void
  onBatchCreate: (files: File[]) => void
  onUpload: (id: string, files: File[]) => void
  onRemoveImage: (id: string, index: number) => void
  onUpdateItem: (id: string, patch: Partial<BatchItem>) => void
  onUpdateProduct: (id: string, patch: Partial<ProductInfo>) => void
  onSetCategoryType: (id: string, ctype: string) => void
  onAddSpec: (id: string) => void
  onUpdateSpec: (id: string, i: number, patch: Partial<{ k: string; v: string }>) => void
  onRemoveSpec: (id: string, i: number) => void
  onAiGenerate: (item: BatchItem) => void
  onAiGenerateAll: () => void
}

export function ParamsPanel({
  items,
  activeItem,
  activeItemId,
  templates,
  selectedIds,
  onSelectItem,
  onRemoveItem,
  onAddItem,
  onBatchCreate,
  onUpload,
  onRemoveImage,
  onUpdateItem,
  onUpdateProduct,
  onSetCategoryType,
  onAddSpec,
  onUpdateSpec,
  onRemoveSpec,
  onAiGenerate,
  onAiGenerateAll,
}: Props) {
  const batchInputRef = useRef<HTMLInputElement | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(''), 1800)
    return () => window.clearTimeout(timer)
  }, [saved])

  const clearForm = () => {
    if (!activeItem) return
    onUpdateItem(activeItem.id, { images: [], prompts: {} })
    onUpdateProduct(activeItem.id, emptyProduct())
  }

  const saveTemplate = () => {
    setSaved('已保存')
  }

  return (
    <aside className="panel left">
      <div className="items-tabs">
        {items.map((item) => (
          <button
            key={item.id}
            className={`item-tab ${item.id === activeItemId ? 'active' : ''}`}
            type="button"
            onClick={() => onSelectItem(item.id)}
          >
            {item.images[0] ? (
              <img src={item.images[0]} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="ph">+</span>
            )}
            <em>{item.name}</em>
            <span className="item-count">{item.images.length} 张</span>
            {items.length > 1 && (
              <i
                className="del"
                title="删除图片库"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveItem(item.id)
                }}
              >
                ×
              </i>
            )}
          </button>
        ))}
        <button className="item-tab add" type="button" onClick={onAddItem}>
          <span className="ph">+</span>
          <em>添加图片库</em>
        </button>
        <button
          className="item-tab add batch"
          type="button"
          onClick={() => batchInputRef.current?.click()}
        >
          <span className="ph">⇪</span>
          <em>＋批量建库</em>
        </button>
        <input
          ref={batchInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            if (files.length) onBatchCreate(files)
            e.target.value = ''
          }}
        />
      </div>

      {activeItem && (
        <div className="form">
          <div className="panel-head params-head">
            <h2>商品信息</h2>
            <button className="tiny" type="button" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? '展开' : '收起'}
            </button>
          </div>

          {!collapsed && (
            <div className="params-body">
              <Section title="商品规格">
                <div className="field">
                  <label>
                    <span>
                      <span className="req">*</span> 商品主图（可多张）
                    </span>
                  </label>
                  <label
                    className="ref-dropzone"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const files = Array.from(e.dataTransfer.files || []).filter((f) =>
                        f.type.startsWith('image/'),
                      )
                      if (files.length) onUpload(activeItem.id, files)
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        if (files.length) onUpload(activeItem.id, files)
                        e.target.value = ''
                      }}
                    />
                    {activeItem.images.length === 0 ? (
                      <span>
                        点击上传图片
                        <br />
                        或拖拽多张图片到这里
                      </span>
                    ) : (
                      <span>
                        已添加 {activeItem.images.length} 张
                        <br />
                        可继续追加或拖拽图片
                      </span>
                    )}
                  </label>
                  {activeItem.images.length > 0 && (
                    <div className="image-grid">
                      {activeItem.images.map((src, i) => (
                        <div className="image-thumb" key={`${activeItem.id}-${i}`}>
                          <img
                            src={src}
                            alt={`reference-${i + 1}`}
                            loading="lazy"
                            decoding="async"
                          />
                          <button
                            className="image-remove"
                            type="button"
                            title="移除"
                            onClick={() => onRemoveImage(activeItem.id, i)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="field two">
                  <Field
                    label={
                      <>
                        <span className="req">*</span> 商品类目
                      </>
                    }
                  >
                    <input
                      value={activeItem.product.category}
                      placeholder="如：数码 / 服饰 / 美妆"
                      onChange={(e) => onUpdateProduct(activeItem.id, { category: e.target.value })}
                    />
                  </Field>
                  <Field label="类目类型">
                    <select
                      value={activeItem.product.categoryType}
                      onChange={(e) => onSetCategoryType(activeItem.id, e.target.value)}
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
                    onChange={(e) => onUpdateProduct(activeItem.id, { variants: e.target.value })}
                  />
                </Field>
                <div className="field">
                  <label>
                    规格参数
                    <button
                      className="tiny inline"
                      type="button"
                      onClick={() => onAddSpec(activeItem.id)}
                    >
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
                        onChange={(e) => onUpdateSpec(activeItem.id, i, { k: e.target.value })}
                      />
                      <input
                        className="spec-v"
                        value={s.v}
                        placeholder="参数值"
                        onChange={(e) => onUpdateSpec(activeItem.id, i, { v: e.target.value })}
                      />
                      <button
                        className="spec-del"
                        type="button"
                        title="删除"
                        onClick={() => onRemoveSpec(activeItem.id, i)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <Field label="其他要求 / 卖点">
                  <textarea
                    rows={3}
                    value={activeItem.product.extra}
                    placeholder="补充描述、核心卖点、色调等"
                    onChange={(e) => onUpdateProduct(activeItem.id, { extra: e.target.value })}
                  />
                </Field>
              </Section>

              <details className="more-options">
                <summary>更多选项（可选）</summary>
                <div className="more-options-body">
                  <Section title="其他信息">
                    <div className="field two">
                      <Field label="商品名称">
                        <input
                          value={activeItem.product.name}
                          placeholder="如：无线蓝牙耳机"
                          onChange={(e) => onUpdateProduct(activeItem.id, { name: e.target.value })}
                        />
                      </Field>
                      <Field label="SKU / 货号">
                        <input
                          value={activeItem.product.sku}
                          placeholder="如：BT-500-BLK"
                          onChange={(e) => onUpdateProduct(activeItem.id, { sku: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="field two">
                      <Field label="风格">
                        <input
                          value={activeItem.product.style}
                          placeholder="如：简约 / 高级 / 复古"
                          onChange={(e) =>
                            onUpdateProduct(activeItem.id, { style: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="背景 / 场景">
                        <input
                          value={activeItem.product.background}
                          placeholder="如：大理石台面 / 咖啡厅"
                          onChange={(e) =>
                            onUpdateProduct(activeItem.id, { background: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </Section>
                </div>
              </details>

              <div className="ai-btns">
                <button
                  className="secondary"
                  disabled={activeItem.loadingPrompts}
                  onClick={() => onAiGenerate(activeItem)}
                  type="button"
                >
                  {activeItem.loadingPrompts ? 'AI 生成中…' : 'AI 生成提示词（本商品）'}
                </button>
                {items.length > 1 && (
                  <button
                    className="secondary"
                    disabled={items.some((it) => it.loadingPrompts)}
                    onClick={onAiGenerateAll}
                    type="button"
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
                            onUpdateItem(activeItem.id, {
                              prompts: { ...activeItem.prompts, [t.id]: e.target.value },
                            })
                          }
                        />
                      </div>
                    ))}
                </div>
              )}

              <div className="panel-footer">
                <button className="secondary" type="button" onClick={clearForm}>
                  清空表单
                </button>
                <button className="secondary" type="button" onClick={saveTemplate} title="暂无持久化，仅作界面占位">
                  保存为模板
                </button>
              </div>
              {saved && <div className="save-toast">{saved}</div>}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <div className="form-section-head">{title}</div>
      <div className="form-section-body">{children}</div>
    </section>
  )
}
