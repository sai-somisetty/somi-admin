'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { AuthUser, AdminUser } from '@/lib/types'

interface Stats {
  total: number
  verified: number
  pending: number
  rejected: number
}

interface InternStat {
  id: string
  name: string
  drafted: number
  verified: number
  rejected: number
}

interface ChapterProgress {
  chapter_number: number
  title: string
  verified: number
  total: number
}

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [stats, setStats] = useState<Stats>({ total: 0, verified: 0, pending: 0, rejected: 0 })
  const [internStats, setInternStats] = useState<InternStat[]>([])
  const [chapterProgress, setChapterProgress] = useState<ChapterProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    loadStats(u)
  }, [])

  async function loadStats(u: AuthUser | null) {
    setLoading(true)
    try {
      const { data: concepts } = await supabase
        .from('concepts')
        .select('id, is_verified, needs_work, chapter_number, created_by')

      if (!concepts) return

      const total = concepts.length
      const verified = concepts.filter(c => c.is_verified).length
      const rejected = concepts.filter(c => c.needs_work).length
      const pending = total - verified - rejected

      setStats({ total, verified, pending, rejected })

      if (u?.role === 'admin') {
        // Per intern stats
        const { data: users } = await supabase
          .from('admin_users')
          .select('id, name')
          .eq('role', 'intern')

        if (users) {
          const iStats: InternStat[] = (users as AdminUser[]).map(intern => {
            const mine = concepts.filter(c => c.created_by === intern.id)
            return {
              id: intern.id,
              name: intern.name,
              drafted: mine.length,
              verified: mine.filter(c => c.is_verified).length,
              rejected: mine.filter(c => c.needs_work).length,
            }
          })
          setInternStats(iStats)
        }

        // Chapter progress
        const { data: chapters } = await supabase
          .from('chapters')
          .select('chapter_number, title')
          .eq('course_id', 'cma')
          .eq('paper_number', 1)
          .order('chapter_number')

        if (chapters) {
          const progress: ChapterProgress[] = chapters.map(ch => {
            const chConcepts = concepts.filter(c => c.chapter_number === ch.chapter_number)
            return {
              chapter_number: ch.chapter_number,
              title: ch.title,
              verified: chConcepts.filter(c => c.is_verified).length,
              total: chConcepts.length || 1,
            }
          })
          setChapterProgress(progress)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Concepts', value: stats.total, color: '#0A2E28', icon: '📝' },
    { label: 'Verified', value: stats.verified, color: '#16a34a', icon: '✅' },
    { label: 'Pending Review', value: stats.pending, color: '#d97706', icon: '⏳' },
    { label: 'Needs Work', value: stats.rejected, color: '#dc2626', icon: '❌' },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Content progress overview
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
              {statCards.map(card => (
                <div
                  key={card.label}
                  className="rounded-xl p-5 shadow-sm"
                  style={{ background: 'var(--surface)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl">{card.icon}</span>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: card.color }}
                    >
                      live
                    </span>
                  </div>
                  <p
                    className="text-3xl font-bold"
                    style={{ color: card.color }}
                  >
                    {card.value}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    {card.label}
                  </p>
                </div>
              ))}
            </div>

            {user?.role === 'admin' && (
              <>
                {/* Chapter progress */}
                <div
                  className="rounded-xl shadow-sm p-5 mb-6"
                  style={{ background: 'var(--surface)' }}
                >
                  <h2
                    className="text-base font-semibold mb-4"
                    style={{ color: 'var(--text)' }}
                  >
                    Chapter Progress
                  </h2>
                  <div className="space-y-3">
                    {chapterProgress.map(ch => {
                      const pct = Math.min(100, Math.round((ch.verified / ch.total) * 100))
                      return (
                        <div key={ch.chapter_number}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm" style={{ color: 'var(--text)' }}>
                              Ch {ch.chapter_number}: {ch.title}
                            </span>
                            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                              {ch.verified}/{ch.total}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: pct === 100 ? '#16a34a' : 'var(--accent)',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Intern stats table */}
                {internStats.length > 0 && (
                  <div
                    className="rounded-xl shadow-sm overflow-hidden"
                    style={{ background: 'var(--surface)' }}
                  >
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                        Intern Performance
                      </h2>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: '#f9f9f7' }}>
                          <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Name</th>
                          <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Drafted</th>
                          <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Verified</th>
                          <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Needs Work</th>
                        </tr>
                      </thead>
                      <tbody>
                        {internStats.map((intern, i) => (
                          <tr
                            key={intern.id}
                            style={{ borderTop: i > 0 ? '1px solid #f0f0ec' : undefined }}
                          >
                            <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>
                              {intern.name}
                            </td>
                            <td className="px-5 py-3 text-right" style={{ color: 'var(--text)' }}>
                              {intern.drafted}
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-green-600">
                              {intern.verified}
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-red-500">
                              {intern.rejected}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
