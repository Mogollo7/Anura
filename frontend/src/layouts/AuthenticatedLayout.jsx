import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from '../components/TopBar'
import Navbar from '../components/Navbar'
import { usePreferencesStore } from '../store/preferencesStore'
import './AuthenticatedLayout.css'

export default function AuthenticatedLayout({ token, guest, onLogout }) {
  const { loadPreferences, fetchPreferences } = usePreferencesStore()
  const isGuest = Boolean(guest && !token)

  useEffect(() => {
    loadPreferences()
    if (token) fetchPreferences()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const outlet = <Outlet />

  if (!token && !guest) return outlet

  return (
    <div className="app-shell">
      <TopBar onLogout={onLogout} isGuest={isGuest} />
      <div className="app-shell-scroll">{outlet}</div>
      <Navbar isGuest={isGuest} />
    </div>
  )
}
