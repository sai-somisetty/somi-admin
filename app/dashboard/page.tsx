'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { AuthUser, AdminUser } from '@/lib/types'

interface Stats {
  total: number
  verified: number
  submitted: number
  pending: number
  rejected: number
  escalated: number
  generated: number
  ungenerated: number
}

interface InternStat {
  id: string
  name: string
  role: string
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

interface DailyRow {
  user_id: string
  name: string
  role: string
  concepts_entered: number
  concepts_generated: number
  concepts_submitted: number
  concepts_approved: number
  concepts_rejected: number
}

interface WeekRow {
  activity_date: string
  concepts_entered: number
  concepts_generated: number
  concepts_submitted: number
}

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [stats, setStats] = useState<Stats>({ total: 0, verified: 0, submitted: 0, pending: 0, rejected: 0, escalated: 0, generated: 0, ungenerated: 0 })
  const [internStats, setInternStats] = useState<InternStat[]>([])
  const [chapterProgress, setChapterProgress] = useState<ChapterProgress[]>([])
  const [todayActivity, setTodayActivity] = useState<DailyRow[]>([])
  const [weekData, setWeekData] = useState<WeekRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async (u: AuthUser | null) => {
    setLoading(true)
    try {
      const { data: concepts } = await supabase
        .from('concepts')
        .select('id, is_verified, needs_work, needs_expert_review, review_status, chapter_number, created_by, tenglish')

      if (!concepts) return

      const total = concepts.length
      const verified = concepts.filter(c => c.is_verified).length
      const rejected = concepts.filter(c => c.needs_work).length
      const escalated = concepts.filter(c => c.needs_expert_review).length
      const submitted = concepts.filter(c => c.review_status === 'submitted').length
      const generated = concepts.filter(c => c.tenglish).length
      const ungenerated = concepts.filter(c => !c.tenglish).length
      const pending = total - verified - rejected - submitted

      setStats({ total, verified, submitted, pending, rejected, escalated, generated, ungenerated })

      if (u?.role === 'admin' || u?.role === 'expert') {
        // Per user stats
        const { data: users } = await supabase
          .from('admin_users')
          .select('id, name, role')
          .neq('role', 'admin')
          .eq('is_active', true)

        if (users) {
          const iStats: InternStat[] = (users as AdminUser[]).map(intern => {
            const mine = concepts.filter(c => c.created_by === intern.id)
            return {
              id: intern.id,
              name: intern.name,
              role: intern.role,
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
              total: chConcepts.length || 0,
            }
          })
          setChapterProgress(progress)
        }

        // Today's activity from daily_activity table
        const { data: dailyData } = await supabase
          .from('user_daily_progress')
          .select('*')

        if (dailyData) {
          setTodayActivity(dailyData as DailyRow[])
        }

        // Last 7 days trend (all users combined)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const { data: weekRaw } = await supabase
          .from('daily_activity')
          .select('activity_date, concepts_entered, concepts_generated, concepts_submitted')
          .gte('activity_date', weekAgo.toISOString().split('T')[0])
          .order('activity_date')

        if (weekRaw) {
          // Aggregate by date
          const dateMap = new Map<string, WeekRow>()
          for (const row of weekRaw) {
            const d = row.activity_date
            const existing = dateMap.get(d) || { activity_date: d, concepts_entered: 0, concepts_generated: 0, concepts_submitted: 0 }
            existing.concepts_entered += row.concepts_entered || 0
            existing.concepts_generated += row.concepts_generated || 0
            existing.concepts_submitted += row.concepts_submitted || 0
            dateMap.set(d, existing)
          }
          setWeekData(Array.from(dateMap.values()))
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    loadStats(u)
    // Auto-refresh every 30s
    const interval = setInterval(() => loadStats(u), 30000)
    return () => clearInterval(interval)
  }, [loadStats])

  const statCards = [
    { label: 'Total Concepts', value: stats.total, color: '#0A2E28', icon: '📝' },
    { label: 'Verified', value: stats.verified, color: '#16a34a', icon: '✅' },
    { label: 'Submitted', value: stats.submitted, color: '#2563eb', icon: '📤' },
    { label: 'Drafts', value: stats.pending, color: '#d97706', icon: '⏳' },
    { label: 'Needs Work', value: stats.rejected, color: '#dc2626', icon: '❌' },
    { label: 'Escalated', value: stats.escalated, color: '#D97706', icon: '⚠️' },
    { label: 'Ungenerated', value: stats.ungenerated, color: '#7c3aed', icon: '🤖' },
  ]

  const maxWeekVal = Math.max(1, ...weekData.map(d => d.concepts_entered + d.concepts_generated + d.concepts_submitted))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Content progress overview
            <span className="ml-2 text-xs opacity-60">Auto-refreshes every 30s</span>
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 mb-8">
              {statCards.map(card => (
                <div key={card.label} className="rounded-xl p-5 shadow-sm" style={{ background: 'var(--surface)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl">{card.icon}</span>
                  </div>
                  <p className="text-3xl font-bold" style={{ color: card.color }}>{card.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{card.label}</p>
                </div>
              ))}
            </div>

            {(user?.role === 'admin' || user?.role === 'expert') && (
              <>
                {/* 7-Day Activity Chart */}
                {weekData.length > 0 && (
                  <div className="rounded-xl shadow-sm p-5 mb-6" style={{ background: 'var(--surface)' }}>
                    <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>
                      7-Day Activity
                    </h2>
                    <div className="flex items-end gap-2" style={{ height: 120 }}>
                      {weekData.map(day => {
                        const entered = day.concepts_entered
                        const generated = day.concepts_generated
                        const submitted = day.concepts_submitted
                        const total = entered + generated + submitted
                        const h = Math.max(4, (total / maxWeekVal) * 100)
                        const dateStr = new Date(day.activity_date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
                        return (
                          <div key={day.activity_date} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full flex flex-col items-center" title={`Entered: ${entered}, Generated: ${generated}, Submitted: ${submitted}`}>
                              <div className="w-full rounded-t-md" style={{ height: `${h}%`, minHeight: 4, background: 'var(--accent)', maxWidth: 40 }} />
                            </div>
                            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{total}</span>
                            <span className="text-xs" style={{ color: 'var(--muted)', fontSize: 10 }}>{dateStr}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                      <span>Bar = total actions (entered + generated + submitted)</span>
                    </div>
                  </div>
                )}

                {/* Today's Activity per user */}
                {todayActivity.length > 0 && (
                  <div className="rounded-xl shadow-sm p-5 mb-6" style={{ background: 'var(--surface)' }}>
                    <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>
                      Today&apos;s Activity
                    </h2>
                    <div className="space-y-3">
                      {todayActivity
                        .filter(d => d.role !== 'admin')
                        .map(d => {
                          const total = d.concepts_entered + d.concepts_generated + d.concepts_submitted
                          return (
                            <div key={d.user_id} className="flex items-center gap-4">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ background: d.role === 'expert' ? '#7c3aed' : 'var(--primary)' }}
                              >
                                {d.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{d.name}</span>
                                  <span
                                    className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                    style={{
                                      background: d.role === 'expert' ? '#F3E8FF' : '#f0f0ec',
                                      color: d.role === 'expert' ? '#7c3aed' : 'var(--muted)',
                                    }}
                                  >
                                    {d.role}
                                  </span>
                                </div>
                                <div className="flex gap-3 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                                  {d.concepts_entered > 0 && <span>✏️ {d.concepts_entered} entered</span>}
                                  {d.concepts_generated > 0 && <span>🤖 {d.concepts_generated} generated</span>}
                                  {d.concepts_submitted > 0 && <span>📤 {d.concepts_submitted} submitted</span>}
                                  {d.concepts_approved > 0 && <span>✅ {d.concepts_approved} approved</span>}
                                  {d.concepts_rejected > 0 && <span>↩️ {d.concepts_rejected} rejected</span>}
                                  {total === 0 && <span>No activity yet</span>}
                                </div>
                              </div>
                              <span className="text-lg font-bold shrink-0" style={{ color: total > 0 ? 'var(--accent)' : '#d1d5db' }}>
                                {total}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Chapter progress */}
                <div className="rounded-xl shadow-sm p-5 mb-6" style={{ background: 'var(--surface)' }}>
                  <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Chapter Progress</h2>
                  <div className="space-y-3">
                    {chapterProgress.map(ch => {
                      const pct = ch.total > 0 ? Math.min(100, Math.round((ch.verified / ch.total) * 100)) : 0
                      return (
                        <div key={ch.chapter_number}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm" style={{ color: 'var(--text)' }}>
                              Ch {ch.chapter_number}: {ch.title}
                            </span>
                            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                              {ch.verified}/{ch.total} {ch.total > 0 && `(${pct}%)`}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : 'var(--accent)' }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    {chapterProgress.length === 0 && (
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>No chapters found</p>
                    )}
                  </div>
                </div>

                {/* Team performance table */}
                {internStats.length > 0 && (
                  <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: 'var(--surface)' }}>
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Team Performance (All Time)</h2>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: '#f9f9f7' }}>
                          <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Name</th>
                          <th className="text-left px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Role</th>
                          <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Drafted</th>
                          <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Verified</th>
                          <th className="text-right px-5 py-3 font-medium" style={{ color: 'var(--muted)' }}>Needs Work</th>
                        </tr>
                      </thead>
                      <tbody>
                        {internStats.map((intern, i) => (
                          <tr key={intern.id} style={{ borderTop: i > 0 ? '1px solid #f0f0ec' : undefined }}>
                            <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{intern.name}</td>
                            <td className="px-5 py-3">
                              <span
                                className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{
                                  background: intern.role === 'expert' ? '#F3E8FF' : '#f0f0ec',
                                  color: intern.role === 'expert' ? '#7c3aed' : 'var(--muted)',
                                }}
                              >
                                {intern.role}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right" style={{ color: 'var(--text)' }}>{intern.drafted}</td>
                            <td className="px-5 py-3 text-right font-medium text-green-600">{intern.verified}</td>
                            <td className="px-5 py-3 text-right font-medium text-red-500">{intern.rejected}</td>
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
