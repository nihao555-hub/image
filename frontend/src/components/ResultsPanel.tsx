import type { TaskResult } from '../api'
import { MAX_ATTEMPTS } from '../constants'
import type { TrackedTask } from '../types'

interface Props {
  tasks: TrackedTask[]
  results: Record<string, TaskResult>
  doneCount: number
}

export function ResultsPanel({ tasks, results, doneCount }: Props) {
  return (
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
                    <img src={url} alt={t.templateName} loading="lazy" decoding="async" />
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
  )
}
