import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MdSearch, MdInventory2 } from 'react-icons/md'
import './Packages.css'
import PackageAccordion from '../components/PackageAccordion'
import ConfirmDialog from '../components/ConfirmDialog'
import { usePackagesStore, findNode, archivosDe } from '../store/packagesStore'

function pruneQuery(node, q) {
  if (!q) return node
  if (node.nombre.toLowerCase().includes(q)) return node
  const hijos = (node.hijos || []).map((h) => pruneQuery(h, q)).filter(Boolean)
  if (!hijos.length) return null
  return { ...node, hijos }
}

function pruneInstalled(node, installed) {
  const propio = node.sha256 && installed[node.id]?.sha256 === node.sha256
  const hijos = (node.hijos || []).map((h) => pruneInstalled(h, installed)).filter(Boolean)
  if (!propio && !hijos.length) return null
  return { ...node, hijos }
}

/**
 * Paquetes regionales. El árbol (país, departamento, subregión) y los archivos
 * salen del servidor. Guardar un nivel superior baja también sus hijos.
 */
export default function Packages() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'mis-paquetes' ? 'mis-paquetes' : 'explorar'
  const [pendingDelete, setPendingDelete] = useState(null)
  const [search, setSearch] = useState('')

  const { paises, load, installed, runtime, refresh, startDownload, cancelDownload, uninstallPackage } = usePackagesStore()

  useEffect(() => { refresh() }, [refresh])

  const setTab = (t) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', t)
    setSearchParams(next)
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return paises
      .map((pais) => (tab === 'mis-paquetes' ? pruneInstalled(pais, installed) : pais))
      .filter(Boolean)
      .map((pais) => pruneQuery(pais, q))
      .filter(Boolean)
  }, [paises, tab, installed, search])

  const borrar = pendingDelete ? findNode(paises, pendingDelete.id) : null
  const archivos = borrar ? archivosDe(borrar) : []

  return (
    <div className="packages-view theme-aware">
      <header className="packages-header">
        <div className="container">
          <h1><MdInventory2 aria-hidden /> Paquetes</h1>
          <p className="packages-subtitle">
            Un paquete por país. Al bajarlo se bajan sus departamentos; dentro de cada uno, sus subregiones.
            También puedes bajar un departamento completo o una sola subregión.
          </p>
        </div>
      </header>

      <div className="packages-tabs-bar">
        <div className="container">
          <div className="tabs" role="tablist">
            <button type="button" className={tab === 'explorar' ? 'active' : ''} onClick={() => setTab('explorar')}>Explorar</button>
            <button type="button" className={tab === 'mis-paquetes' ? 'active' : ''} onClick={() => setTab('mis-paquetes')}>Mis paquetes</button>
          </div>
        </div>
      </div>

      <div className="container packages-content">
        <div className="packages-filter-wrapper">
          <MdSearch className="packages-filter-icon" aria-hidden />
          <input
            type="text"
            className="packages-filter-input"
            placeholder="Buscar país, departamento o subregión…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {load === 'loading' || load === 'idle' ? (
          <div className="packages-empty"><p>Cargando paquetes del servidor…</p></div>
        ) : load === 'error' ? (
          <div className="packages-empty">
            <MdInventory2 aria-hidden />
            <p>No se pudo leer el catálogo de paquetes. Revisa que el servidor esté en marcha.</p>
            <button type="button" className="btn-primary" onClick={refresh}>Reintentar</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="packages-empty">
            <MdInventory2 aria-hidden />
            <p>{tab === 'mis-paquetes' ? 'Todavía no hay paquetes guardados en este navegador.' : 'No hay paquetes que coincidan.'}</p>
          </div>
        ) : (
          <PackageAccordion
            paises={visible}
            runtime={runtime}
            installed={installed}
            onDownload={(node) => startDownload(node.id)}
            onCancel={cancelDownload}
            onDelete={setPendingDelete}
          />
        )}
      </div>

      {borrar && (
        <ConfirmDialog
          title={`¿Eliminar ${borrar.nombre}?`}
          message={archivos.length > 1
            ? 'Se quitan de este navegador el paquete y los que contiene. Podrás volver a bajarlos.'
            : 'Se quita de este navegador. Podrás volver a bajarlo.'}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { uninstallPackage(borrar.id); setPendingDelete(null) }}
        />
      )}
    </div>
  )
}
