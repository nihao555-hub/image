import { useState } from 'react'
import { authRequest, setAuth, type AuthUser } from '../api'

export function AuthPage({ onAuth }: { onAuth: (user: AuthUser) => void }) {
  const [kind, setKind] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await authRequest(kind, email, password)
      setAuth(user)
      onAuth(user)
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={(e) => void submit(e)}>
        <h2>{kind === 'login' ? '登录图匠' : '注册图匠账号'}</h2>
        <p className="auth-sub">注册后登录即可使用批量去水印 / 超清图片 / 套图生成</p>
        {error && <div className="error-bar">{error}</div>}
        <label>
          邮箱
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          密码
          <input
            type="password"
            required
            minLength={6}
            autoComplete={kind === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
          />
        </label>
        <button className="primary big full" type="submit" disabled={busy}>
          {busy ? '请稍候…' : kind === 'login' ? '登录' : '注册并登录'}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setError('')
            setKind(kind === 'login' ? 'register' : 'login')
          }}
        >
          {kind === 'login' ? '还没有账号？去注册' : '已有账号？去登录'}
        </button>
      </form>
    </div>
  )
}
