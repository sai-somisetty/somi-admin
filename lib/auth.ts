import { supabase } from './supabase'
import { AuthUser } from './types'

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, name, email, role, password_hash, is_active')
    .eq('email', email)
    .single()

  if (error || !data) {
    throw new Error('Invalid email or password')
  }

  if (!data.is_active) {
    throw new Error('Account is deactivated. Contact admin.')
  }

  if (data.password_hash !== password) {
    throw new Error('Invalid email or password')
  }

  const user: AuthUser = {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem('somi_admin_user', JSON.stringify(user))
  }

  return user
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('somi_admin_user')
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem('somi_admin_user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function getHomeRoute(role: AuthUser['role']): string {
  return role === 'admin' ? '/dashboard/review' : '/dashboard/content'
}

export function requireAuth(): AuthUser {
  const user = getStoredUser()
  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    throw new Error('Not authenticated')
  }
  return user
}
