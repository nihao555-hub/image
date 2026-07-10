export const HISTORY_KEY = 'ecom_image_history'
export const HISTORY_MAX = 40
export const MAX_ATTEMPTS = 3

export const DENSITIES: { id: string; name: string }[] = [
  { id: 'clean', name: '简洁少字' },
  { id: 'balanced', name: '均衡' },
  { id: 'rich', name: '富信息' },
]

export const TEXT_LEVEL_LABEL: Record<string, string> = {
  light: '少量文字',
  rich: '富信息',
}

export const LANGUAGES: { id: string; name: string }[] = [
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
export const CATEGORY_TYPES: { id: string; name: string; keys: string[] }[] = [
  { id: 'general', name: '通用', keys: [] },
  { id: 'apparel', name: '服饰', keys: ['尺码', '材质', '颜色', '适用人群', '版型'] },
  { id: 'digital', name: '数码', keys: ['规格', '接口', '续航', '重量', '兼容性'] },
  { id: 'beauty', name: '美妆', keys: ['容量', '成分', '功效', '适用肤质', '产地'] },
  { id: 'home', name: '家居', keys: ['尺寸', '材质', '容量', '重量', '保养'] },
  { id: 'food', name: '食品', keys: ['净含量', '口味', '配料', '保质期', '储存方式'] },
]
