import type { GenerateJob, ProductInfo } from './api'

export interface BatchItem {
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

export interface HistoryImage {
  label: string
  url: string
}

export interface HistoryEntry {
  id: string
  ts: number
  title: string
  images: HistoryImage[]
}

export interface TrackedTask {
  taskId: string
  itemId: string
  itemName: string
  templateId: string
  templateName: string
  job: GenerateJob
  attempts: number
}

export const emptyProduct = (): ProductInfo => ({
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
export const newItem = (cfg?: {
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

export const fmtTime = (ts: number) => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
