'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, getHomeRoute } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      router.push(getHomeRoute(user.role))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* LEFT HALF — dark teal gradient */}
      <div
        className="flex flex-col items-center justify-center md:w-1/2 w-full px-10 py-12 md:py-0"
        style={{
          background: 'linear-gradient(135deg, #0A2E28 0%, #0A4A3C 100%)',
          minHeight: '200px',
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-white font-bold leading-none mb-1" style={{ fontSize: '64px' }}>
            SOMI
          </div>
          <div className="font-semibold tracking-widest uppercase text-sm" style={{ color: '#E67E22', fontSize: '16px' }}>
            Content Manager
          </div>
        </div>

        {/* Tagline */}
        <p className="text-white text-center mb-8 hidden md:block" style={{ fontSize: '18px' }}>
          Build the future of CMA education
        </p>

        {/* Feature pills */}
        <div className="flex flex-col gap-3 items-center hidden md:flex">
          {[
            { icon: '🧠', label: 'AI Generated Content' },
            { icon: '✅', label: 'Quality Reviewed' },
            { icon: '🚀', label: 'Live in seconds' },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-medium"
              style={{ background: 'rgba(255,255,255,0.10)' }}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Powered by */}
        <p className="text-xs mt-10 hidden md:block" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Powered by Claude AI
        </p>
      </div>

      {/* RIGHT HALF — white form */}
      <div className="flex flex-col items-center justify-center md:w-1/2 w-full px-8 py-12 bg-white">
        <div className="w-full max-w-sm">
          <h1 className="font-bold mb-1" style={{ fontSize: '24px', color: '#0A2E28' }}>
            Welcome back
          </h1>
          <p className="text-sm mb-8" style={{ color: '#6B7280' }}>
            Sign in to your admin account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A1208' }}>
                Email
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@somi.app"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none transition-all focus:ring-2"
                  style={{ color: '#1A1208' }}
                  onFocus={e => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#1A1208' }}>
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-10 py-2.5 text-sm outline-none transition-all"
                  style={{ color: '#1A1208' }}
                  onFocus={e => { e.target.style.borderColor = '#E67E22'; e.target.style.boxShadow = '0 0 0 3px rgba(230,126,34,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-red-50 border border-red-200">
                <span className="text-red-500 text-xs">⚠</span>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-all disabled:opacity-60 cursor-pointer active:scale-[0.98]"
              style={{ background: loading ? '#c9681b' : '#E67E22' }}
              onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#c9681b' }}
              onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#E67E22' }}
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

          <p className="text-center text-xs mt-6" style={{ color: '#6B7280' }}>
            Only authorized accounts can access this portal
          </p>
        </div>
      </div>
    </div>
  )
}
