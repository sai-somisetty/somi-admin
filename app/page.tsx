'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getStoredUser } from '@/lib/auth'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.replace('/login')
    } else if (user.role === 'admin') {
      router.replace('/dashboard/review')
    } else {
      router.replace('/dashboard/content')
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p style={{ color: 'var(--muted)' }} className="text-sm">Loading...</p>
      </div>
    </div>
  )
}
