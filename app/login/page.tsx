'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      if (user.role === 'admin') {
        router.push('/dashboard/review')
      } else {
        router.push('/dashboard/content')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-lg"
        style={{ background: 'var(--surface)' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-4"
            style={{ background: 'var(--primary)' }}
          >
            <span className="text-white font-bold text-xl tracking-tight">SOMI</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-md"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Admin
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            EdTech Content Management System
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text)' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@somi.app"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              style={{ color: 'var(--text)' }}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text)' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              style={{ color: 'var(--text)' }}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 cursor-pointer"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted)' }}>
          Default: sai@somi.app / admin123
        </p>
      </div>
    </div>
  )
}
