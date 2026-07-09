export type TextLevel = 'none' | 'light' | 'rich'

export interface Template {
  id: string
  name: string
  en: string
  category: string
  aspectRatio: string
  hasText: boolean
  textLevel: TextLevel
  example: string
  guidance: string
  desc?: string
}

export interface Category {
  id: string
  name: string
}

export type TextDensity = 'clean' | 'balanced' | 'rich'

export interface Platform {
  id: string
  name: string
  region: string
  language: string
  size: string
  aspect: string
  textDensity: TextDensity
  templates: string[]
  note: string
}

export interface SpecItem {
  k: string
  v: string
}

export interface ProductInfo {
  name: string
  category: string
  style: string
  background: string
  extra: string
  categoryType: string
  sku: string
  variants: string
  specs: SpecItem[]
}

export interface GenerateJob {
  template_id: string
  prompt: string
  aspectRatio: string
  platform?: string
  quality: string
  image_base64?: string | null
  label: string
}

export interface TaskInfo {
  task_id: string
  template_id: string
  label: string
}

export interface TaskResult {
  status: string
  progress: number
  results: { url: string }[]
  failure_reason?: string
  error?: string
}

export interface AuthUser {
  token: string
  email: string
  api_key: string
}

const AUTH_KEY = 'tj-auth'

export function getAuth(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function setAuth(user: AuthUser | null) {
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  else localStorage.removeItem(AUTH_KEY)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const user = getAuth()
  if (user) headers['Authorization'] = `Bearer ${user.token}`
  const resp = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    if (resp.status === 401 && user) {
      setAuth(null)
      window.dispatchEvent(new Event('tj-unauth'))
    }
    const text = await resp.text()
    throw new Error(`${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

export async function authRequest(
  kind: 'login' | 'register',
  email: string,
  password: string,
): Promise<AuthUser> {
  const resp = await fetch(`/api/auth/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(
      typeof data.detail === 'string' ? data.detail : `请求失败 (${resp.status})`,
    )
  }
  return data as AuthUser
}

export async function fetchTemplates(): Promise<{ templates: Template[]; categories: Category[] }> {
  const resp = await fetch('/api/templates')
  if (!resp.ok) throw new Error('Failed to load templates')
  return resp.json()
}

export async function fetchPlatforms(): Promise<Platform[]> {
  const resp = await fetch('/api/platforms')
  if (!resp.ok) throw new Error('Failed to load platforms')
  const data = await resp.json()
  return data.platforms as Platform[]
}

export async function generatePrompts(
  product: ProductInfo,
  templateIds: string[],
  hasImage: boolean,
  platform: string,
  language: string,
  density: string,
  imageBase64?: string | null,
): Promise<Record<string, string>> {
  const data = await post<{ prompts: Record<string, string> }>('/api/generate-prompts', {
    product,
    template_ids: templateIds,
    has_image: hasImage,
    platform,
    language,
    density,
    image_base64: imageBase64 ?? null,
  })
  return data.prompts
}

export async function generateImages(jobs: GenerateJob[]): Promise<TaskInfo[]> {
  const data = await post<{ tasks: TaskInfo[] }>('/api/generate', { jobs })
  return data.tasks
}

export type RestoreMode = 'pro' | 'fast'

export async function submitRestore(
  feature: 'watermark' | 'upscale',
  imageBase64: string,
  mode: RestoreMode,
): Promise<string> {
  const data = await post<{ task_id: string }>(`/api/${feature}`, {
    image_base64: imageBase64,
    mode,
  })
  return data.task_id
}

export async function fetchResults(ids: string[]): Promise<Record<string, TaskResult>> {
  const data = await post<{ results: Record<string, TaskResult> }>('/api/result', { ids })
  return data.results
}
