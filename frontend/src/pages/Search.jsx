import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MdPerson, MdCalendarToday, MdMap } from 'react-icons/md'
import LoadingSpinner from '../components/LoadingSpinner'
import { API_BASE, apiGet, getThumbUrl } from '../services/api'
import './Search.css'
import Thumb from '../components/Thumb'

const mediaUrl = (path) => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  return `${base}${p}`
}

const getImageUrl = (key, size = 'medium') => {
  if (!key) return ''
  const filename = key.split('/').pop()
  return getThumbUrl(filename, size)
}

export default function Search() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''

  const [activeTab, setActiveTab] = useState('all') // 'all', 'taxa', 'users'
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState({ taxa: [], users: [] })

  useEffect(() => {
    if (!query) return
    const fetchResults = async () => {
      setLoading(true)
      try {
        const data = await apiGet(`/api/explorer/search?q=${encodeURIComponent(query)}`, { auth: false })
        setResults(data)
      } catch (e) {
        console.error('Error fetching search results:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [query])

  const { taxa, users } = results

  const renderTaxa = () => (
    <div className="search-list">
      {taxa.length === 0 && activeTab === 'taxa' && <div className="no-results">No se encontraron taxones.</div>}
      {taxa.map(t => (
        <div key={t.id} className="search-card" onClick={() => navigate(`/taxa/${t.slug}`)}>
          <div className="search-card-img">
            <Thumb src={getImageUrl(t.thumbnail_key, 'small')} alt={t.scientific_name} />
          </div>
          <div className="search-card-info">
            <h3 className="search-card-title">{t.common_name || 'Sin nombre común'}</h3>
            <span className="search-card-subtitle"><i>{t.scientific_name}</i></span>
            <div className="search-card-meta">
              <span>{t.class_name}</span> &bull; <span>{t.order_name}</span> &bull; <span>{t.family}</span>
            </div>
          </div>
          <div className="search-card-stats">
            <span className="stat-pill"><MdMap aria-hidden /> {t.obs_count} obs</span>
          </div>
        </div>
      ))}
    </div>
  )

  const renderUsers = () => (
    <div className="search-list">
      {users.length === 0 && activeTab === 'users' && <div className="no-results">No se encontraron usuarios.</div>}
      {users.map(u => (
        <div key={u.username} className="search-card user-card" onClick={() => navigate(`/people/${u.username}`)}>
          <div className="search-card-img avatar">
            {u.profile_image ? (
              <img src={mediaUrl(u.profile_image)} alt={u.username} />
            ) : (
              <div className="placeholder-img"><MdPerson aria-hidden /></div>
            )}
          </div>
          <div className="search-card-info">
            <h3 className="search-card-title">{u.username}</h3>
            <div className="search-card-meta">
              <MdCalendarToday aria-hidden /> Miembro desde {new Date(u.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div className="search-card-stats">
            <span className="stat-pill"><MdMap aria-hidden /> {u.obs_count} obs</span>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="search-page theme-aware">
      <header className="search-header">
        <div className="container">
          <h1>Resultados para <span>"{query}"</span></h1>
        </div>
      </header>

      <div className="search-tabs-wrapper">
        <div className="container">
          <div className="search-tabs">
            <button
              className={activeTab === 'all' ? 'active' : ''}
              onClick={() => setActiveTab('all')}
            >
              Todos <span className="badge">{taxa.length + users.length}</span>
            </button>
            <button
              className={activeTab === 'taxa' ? 'active' : ''}
              onClick={() => setActiveTab('taxa')}
            >
              Taxones <span className="badge">{taxa.length}</span>
            </button>
            <button
              className={activeTab === 'users' ? 'active' : ''}
              onClick={() => setActiveTab('users')}
            >
              Usuarios <span className="badge">{users.length}</span>
            </button>
          </div>
        </div>
      </div>

      <main className="search-main">
        <div className="container">
          {loading ? (
            <LoadingSpinner text="Buscando..." />
          ) : (
            <div className="search-results">
              {activeTab === 'all' && (
                <>
                  {taxa.length === 0 && users.length === 0 && (
                    <div className="no-results">No se encontraron resultados para "{query}".</div>
                  )}
                  {taxa.length > 0 && (
                    <section className="result-section">
                      <h2 className="section-title">Taxones</h2>
                      {renderTaxa()}
                    </section>
                  )}
                  {users.length > 0 && (
                    <section className="result-section">
                      <h2 className="section-title">Usuarios</h2>
                      {renderUsers()}
                    </section>
                  )}
                </>
              )}
              {activeTab === 'taxa' && renderTaxa()}
              {activeTab === 'users' && renderUsers()}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
