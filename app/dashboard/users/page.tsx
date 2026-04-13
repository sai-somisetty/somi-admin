'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getStoredUser } from '@/lib/auth'
import { AuthUser, AdminUser } from '@/lib/types'

interface InternWithStats extends AdminUser {
  concepts_count: number
}

const CHAPTERS = [1, 2, 3, 4, 5]

export default function UsersPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [users, setUsers] = useState<InternWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'intern' as 'intern' | 'expert' | 'admin',
    assigned_chapters: [] as number[],
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const u = getStoredUser()
    if (!u || u.role !== 'admin') {
      router.replace('/dashboard')
      return
    }
    setCurrentUser(u)
    loadUsers()
  }, [router])

  async function loadUsers() {
    setLoading(true)
    const { data: allUsers } = await supabase
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: false })

    if (!allUsers) { setLoading(false); return }

    const { data: conceptCounts } = await supabase
      .from('concepts')
      .select('created_by')

    const countMap: Record<string, number> = {}
    if (conceptCounts) {
      for (const c of conceptCounts) {
        if (c.created_by) countMap[c.created_by] = (countMap[c.created_by] || 0) + 1
      }
    }

    const enriched: InternWithStats[] = (allUsers as AdminUser[]).map(u => ({
      ...u,
      concepts_count: countMap[u.id] || 0,
    }))

    setUsers(enriched)
    setLoading(false)
  }

  async function toggleActive(user: InternWithStats) {
    await supabase
      .from('admin_users')
      .update({ is_active: !user.is_active })
      .eq('id', user.id)
    loadUsers()
  }

  async function addUser() {
    if (!form.name || !form.email || !form.password) {
      setFormError('Name, email and password are required')
      return
    }
    setSaving(true)
    setFormError('')
    const { error } = await supabase.from('admin_users').insert({
      name: form.name,
      email: form.email,
      password_hash: form.password,
      role: form.role,
      assigned_chapters: form.assigned_chapters,
      is_active: true,
    })
    if (error) {
      setFormError(error.message)
    } else {
      setShowForm(false)
      setForm({ name: '', email: '', password: '', role: 'intern', assigned_chapters: [] })
      loadUsers()
    }
    setSaving(false)
  }

  function toggleChapter(ch: number) {
    setForm(prev => ({
      ...prev,
      assigned_chapters: prev.assigned_chapters.includes(ch)
        ? prev.assigned_chapters.filter(c => c !== ch)
        : [...prev.assigned_chapters, ch],
    }))
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all'

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Users</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Manage intern accounts and permissions
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer"
            style={{ background: 'var(--accent)' }}
          >
            + Add User
          </button>
        </div>

        {/* Add user form */}
        {showForm && (
          <div
            className="rounded-xl shadow-sm p-5 mb-6"
            style={{ background: 'var(--surface)' }}
          >
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>
              New User
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Name</label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Email</label>
                <input
                  type="email"
                  className={inputCls}
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="intern@somi.app"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Password</label>
                <input
                  type="text"
                  className={inputCls}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Temporary password"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Role</label>
                <select
                  className={inputCls}
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value as 'intern' | 'expert' | 'admin' }))}
                >
                  <option value="intern">Intern (data entry)</option>
                  <option value="expert">Expert Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                Assign Chapters
              </label>
              <div className="flex gap-3 flex-wrap">
                {CHAPTERS.map(ch => (
                  <label
                    key={ch}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                    style={{ color: 'var(--text)' }}
                  >
                    <input
                      type="checkbox"
                      checked={form.assigned_chapters.includes(ch)}
                      onChange={() => toggleChapter(ch)}
                      className="accent-orange-500 w-4 h-4"
                    />
                    Chapter {ch}
                  </label>
                ))}
              </div>
            </div>

            {formError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <p className="text-sm text-red-600">{formError}</p>
              </div>
            )}

            <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={addUser}
                disabled={saving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
                style={{ background: 'var(--accent)' }}
              >
                {saving ? 'Creating...' : 'Create User'}
              </button>
              <button
                onClick={() => { setShowForm(false); setFormError('') }}
                className="rounded-lg px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 cursor-pointer"
                style={{ color: 'var(--text)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Users list */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div
            className="rounded-xl shadow-sm overflow-hidden"
            style={{ background: 'var(--surface)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f9f9f7', borderBottom: '1px solid #f0f0ec' }}>
                  <th className="text-left px-5 py-3 font-semibold text-xs" style={{ color: 'var(--muted)' }}>User</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs" style={{ color: 'var(--muted)' }}>Role</th>
                  <th className="text-right px-5 py-3 font-semibold text-xs" style={{ color: 'var(--muted)' }}>Concepts</th>
                  <th className="text-left px-5 py-3 font-semibold text-xs" style={{ color: 'var(--muted)' }}>Assigned Chapters</th>
                  <th className="text-center px-5 py-3 font-semibold text-xs" style={{ color: 'var(--muted)' }}>Status</th>
                  <th className="text-center px-5 py-3 font-semibold text-xs" style={{ color: 'var(--muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{ borderTop: i > 0 ? '1px solid #f0f0ec' : undefined }}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: u.role === 'admin' ? 'var(--accent)' : u.role === 'expert' ? '#7c3aed' : 'var(--primary)' }}
                        >
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium" style={{ color: 'var(--text)' }}>{u.name}</p>
                          <p className="text-xs" style={{ color: 'var(--muted)' }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: u.role === 'admin' ? '#FEF3E8' : u.role === 'expert' ? '#F3E8FF' : '#f0f0ec',
                          color: u.role === 'admin' ? 'var(--accent)' : u.role === 'expert' ? '#7c3aed' : 'var(--muted)',
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium" style={{ color: 'var(--text)' }}>
                      {u.concepts_count}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(u.assigned_chapters as number[]).length > 0 ? (
                          (u.assigned_chapters as number[]).map(ch => (
                            <span
                              key={ch}
                              className="text-xs px-1.5 py-0.5 rounded-md"
                              style={{ background: '#f0f0ec', color: 'var(--muted)' }}
                            >
                              Ch {ch}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>All</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: u.is_active ? '#dcfce7' : '#fee2e2',
                          color: u.is_active ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {currentUser?.id !== u.id && (
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer"
                          style={{
                            borderColor: u.is_active ? '#fee2e2' : '#dcfce7',
                            color: u.is_active ? '#dc2626' : '#16a34a',
                          }}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
