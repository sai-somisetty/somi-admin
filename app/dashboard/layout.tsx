'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getStoredUser, logout } from '@/lib/auth'
import { AuthUser } from '@/lib/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', adminOnly: false },
  { href: '/dashboard/content', label: 'Add Content', icon: '✏️', adminOnly: false },
  { href: '/dashboard/review', label: 'Review Queue', icon: '✅', adminOnly: true },
  { href: '/dashboard/users', label: 'Users', icon: '👥', adminOnly: true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const u = getStoredUser()
    if (!u) {
      router.replace('/login')
    } else {
      setUser(u)
    }
  }, [router])

  function handleLogout() {
    logout()
    router.push('/login')
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const visibleNav = navItems.filter(item => !item.adminOnly || user.role === 'admin')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col h-full shrink-0"
        style={{ width: 240, background: 'var(--primary)' }}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg tracking-tight">SOMI</span>
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded-md text-white"
              style={{ background: 'var(--accent)' }}
            >
              Admin
            </span>
          </div>
          <p className="text-white/40 text-xs mt-0.5">Content Manager</p>
        </div>

        {/* User info */}
        <div className="px-4 py-4 border-b border-white/10">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm mb-2"
            style={{ background: 'var(--accent)' }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <p className="text-white text-sm font-medium leading-tight">{user.name}</p>
          <span
            className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: user.role === 'admin' ? 'rgba(230,126,34,0.25)' : 'rgba(255,255,255,0.15)',
              color: user.role === 'admin' ? '#f0a060' : 'rgba(255,255,255,0.7)',
            }}
          >
            {user.role === 'admin' ? 'Admin' : 'Intern'}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.65)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-5 border-t border-white/10 pt-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all hover:bg-white/10 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            <span className="text-base">🚪</span>
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
