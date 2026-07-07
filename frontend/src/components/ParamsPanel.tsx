import type { ProductInfo, Template } from '../api'
import { CATEGORY_TYPES, TEXT_LEVEL_LABEL } from '../constants'
import type { BatchItem } from '../types'
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
  onUpload: (id: string, file: File) => void
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
  onUpload,
  onUpdateItem,
  onUpdateProduct,
  onSetCategoryType,
  onAddSpec,
  onUpdateSpec,
  onRemoveSpec,
  onAiGenerate,
  onAiGenerateAll,
}: Props) {
  return (
    <aside className="panel left">
      <div className="items-tabs">
        {items.map((item) => (
          <button
            key={item.id}
            className={`item-tab ${item.id === activeItemId ? 'active' : ''}`}
            onClick={() => onSelectItem(item.id)}
          >
            {item.imageDataUrl ? (
              <img src={item.imageDataUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="ph">+</span>
            )}
            <em>{item.name}</em>
            {items.length > 1 && (
              <i
                className="del"
                title="删除商品"
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
        <button className="item-tab add" onClick={onAddItem}>
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
              onChange={(e) => onUpdateProduct(activeItem.id, { name: e.target.value })}
            />
          </Field>
          <Field label="商品类目">
            <input
              value={activeItem.product.category}
              placeholder="如：数码 / 服饰 / 美妆"
              onChange={(e) => onUpdateProduct(activeItem.id, { category: e.target.value })}
            />
          </Field>
          <div className="field two">
            <Field label="SKU / 货号">
              <input
                value={activeItem.product.sku}
                placeholder="如：BT-500-BLK"
                onChange={(e) => onUpdateProduct(activeItem.id, { sku: e.target.value })}
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
              <button className="tiny inline" onClick={() => onAddSpec(activeItem.id)}>
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
                  title="删除"
                  onClick={() => onRemoveSpec(activeItem.id, i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <Field label="风格">
            <input
              value={activeItem.product.style}
              placeholder="如：简约 / 高级 / 复古"
              onChange={(e) => onUpdateProduct(activeItem.id, { style: e.target.value })}
            />
          </Field>
          <Field label="背景 / 场景">
            <input
              value={activeItem.product.background}
              placeholder="如：大理石台面 / 咖啡厅"
              onChange={(e) => onUpdateProduct(activeItem.id, { background: e.target.value })}
            />
          </Field>
          <Field label="其他要求 / 卖点">
            <textarea
              rows={3}
              value={activeItem.product.extra}
              placeholder="补充描述、核心卖点、色调等"
              onChange={(e) => onUpdateProduct(activeItem.id, { extra: e.target.value })}
            />
          </Field>
          <div className="ai-btns">
            <button
              className="secondary"
              disabled={activeItem.loadingPrompts}
              onClick={() => onAiGenerate(activeItem)}
            >
              {activeItem.loadingPrompts ? 'AI 生成中…' : 'AI 生成提示词（本商品）'}
            </button>
            {items.length > 1 && (
              <button
                className="secondary"
                disabled={items.some((it) => it.loadingPrompts)}
                onClick={onAiGenerateAll}
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
                        onUpdateItem(activeItem.id, {
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
}
