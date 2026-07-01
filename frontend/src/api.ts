export interface Template {
  id: string
  name: string
  en: string
  aspectRatio: string
  guidance: string
}

export interface ProductInfo {
  name: string
  category: string
  style: string
  background: string
  extra: string
}

export interface GenerateJob {
  template_id: string
  prompt: string
  aspectRatio: string
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

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`${resp.status}: ${text}`)
  }
  return resp.json() as Promise<T>
}

export async function fetchTemplates(): Promise<Template[]> {
  const resp = await fetch('/api/templates')
  if (!resp.ok) throw new Error('Failed to load templates')
  const data = await resp.json()
  return data.templates as Template[]
}

export async function generatePrompts(
  product: ProductInfo,
  templateIds: string[],
  hasImage: boolean,
): Promise<Record<string, string>> {
  const data = await post<{ prompts: Record<string, string> }>('/api/generate-prompts', {
    product,
    template_ids: templateIds,
    has_image: hasImage,
  })
  return data.prompts
}

export async function generateImages(jobs: GenerateJob[]): Promise<TaskInfo[]> {
  const data = await post<{ tasks: TaskInfo[] }>('/api/generate', { jobs })
  return data.tasks
}

export async function fetchResults(ids: string[]): Promise<Record<string, TaskResult>> {
  const data = await post<{ results: Record<string, TaskResult> }>('/api/result', { ids })
  return data.results
}
