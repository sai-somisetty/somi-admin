'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getStoredUser, logout } from '@/lib/auth'
import { AuthUser } from '@/lib/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'expert', 'intern'] },
  { href: '/dashboard/content', label: 'Add Content', icon: '✏️', roles: ['admin', 'expert', 'intern'] },
  { href: '/dashboard/generate', label: 'Generate Queue', icon: '🤖', roles: ['admin'] },
  { href: '/dashboard/review', label: 'Review Queue', icon: '✅', roles: ['admin', 'expert'] },
  { href: '/dashboard/import', label: 'Bulk Import', icon: '📥', roles: ['admin'] },
  { href: '/dashboard/users', label: 'Users', icon: '👥', roles: ['admin'] },
]

const SIDEBAR_KEY = 'somi_sidebar_collapsed'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored === 'true') setCollapsed(true)
  }, [])

  useEffect(() => {
    const u = getStoredUser()
    if (!u) {
      router.replace('/login')
    } else {
      setUser(u)
    }
  }, [router])

  function toggleSidebar() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }

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

  const visibleNav = navItems.filter(item => item.roles.includes(user.role))

  const roleBadge: Record<string, { bg: string; color: string; label: string }> = {
    admin: { bg: 'rgba(230,126,34,0.25)', color: '#f0a060', label: 'Admin' },
    expert: { bg: 'rgba(124,58,237,0.25)', color: '#c4b5fd', label: 'Expert' },
    intern: { bg: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', label: 'Intern' },
  }

  const badge = roleBadge[user.role] || roleBadge.intern

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <aside
        className="flex flex-col h-full shrink-0 transition-all duration-200"
        style={{ width: collapsed ? 48 : 240, background: 'var(--primary)', overflow: 'hidden' }}
      >
        <div
          className="flex items-center border-b border-white/10 shrink-0"
          style={{ height: 48, justifyContent: collapsed ? 'center' : 'flex-end', paddingRight: collapsed ? 0 : 8 }}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 px-5">
              <span className="text-white font-bold text-lg tracking-tight">SOMI</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md text-white" style={{ background: 'var(--accent)' }}>Admin</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center justify-center rounded-md transition-colors hover:bg-white/10 cursor-pointer shrink-0"
            style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        <div
          className="border-b border-white/10 shrink-0"
          style={{ padding: collapsed ? '12px 0' : '16px', display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'flex-start' }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'var(--accent)', flexShrink: 0 }}
            title={user.name}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <p className="text-white text-sm font-medium leading-tight mt-2">{user.name}</p>
              <span
                className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            </>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto" style={{ paddingLeft: collapsed ? 0 : 12, paddingRight: collapsed ? 0 : 12 }}>
          {visibleNav.map(item => {
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className="flex items-center rounded-lg text-sm transition-all"
                style={{
                  gap: collapsed ? 0 : 12,
                  padding: collapsed ? '8px 0' : '8px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.65)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span className="text-base leading-none shrink-0">{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-white/10 pb-4 pt-3 shrink-0" style={{ paddingLeft: collapsed ? 0 : 12, paddingRight: collapsed ? 0 : 12 }}>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className="flex items-center rounded-lg text-sm transition-all hover:bg-white/10 cursor-pointer w-full"
            style={{ gap: collapsed ? 0 : 12, padding: collapsed ? '8px 0' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start', color: 'rgba(255,255,255,0.55)' }}
          >
            <span className="text-base shrink-0">🚪</span>
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
