import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from '../components/TopBar'
import Navbar from '../components/Navbar'
import { usePreferencesStore } from '../store/preferencesStore'
import { isPanelAccount } from '../lib/adminAccess'
import './AuthenticatedLayout.css'

export default function AuthenticatedLayout({ token, guest, onLogout }) {
  const { loadPreferences, fetchPreferences } = usePreferencesStore()
  const isGuest = Boolean(guest && !token)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    loadPreferences()
    if (token) fetchPreferences()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    isPanelAccount().then((result) => {
      if (!cancelled) setIsAdmin(result)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const outlet = <Outlet />

  return (
    <div className="app-shell">
      <TopBar onLogout={onLogout} isGuest={isGuest} isAdmin={isAdmin} token={token} />
      <div className="app-shell-scroll">{outlet}</div>
      <Navbar isAdmin={isAdmin} token={token} />
    </div>
  )
}
