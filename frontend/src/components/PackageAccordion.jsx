import { useState } from 'react'
import {
  MdDownload, MdDelete, MdClose, MdRefresh, MdCheckCircle,
  MdExpandMore, MdChevronRight, MdInventory2,
} from 'react-icons/md'
import { archivosDe, estadoVisible } from '../store/packagesStore'

const formatSize = (bytes) => {
  if (!bytes) return '0 KB'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 1) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const ETIQUETA = {
  sqlite: 'Identificación',
  json: 'Catálogo de la subregión',
}

function meta(node) {
  const partes = []
  if (node.formato && ETIQUETA[node.formato]) partes.push(ETIQUETA[node.formato])
  else if (node.nivel === 'pais') partes.push('País')
  else if (node.nivel === 'departamento') partes.push('Departamento')
  if (node.especies) partes.push(`${node.especies} especies`)
  if (node.version && node.formato) partes.push(`v${node.version}`)
  const archivos = archivosDe(node)
  const bytes = node.formato ? (node.size_archivo || node.size_bytes) : (node.size_bytes || archivos.reduce((s, f) => s + (f.size_bytes || 0), 0))
  if (bytes) partes.push(formatSize(bytes))
  if (!node.formato && node.hijos?.length) {
    const subs = node.hijos.filter((h) => h.nivel === 'subregion').length
    const deps = node.hijos.filter((h) => h.nivel === 'departamento').length
    if (deps) partes.push(deps === 1 ? '1 departamento' : `${deps} departamentos`)
    if (subs) partes.push(subs === 1 ? '1 subregión' : `${subs} subregiones`)
  }
  return partes.join(' · ')
}

function NodeRow({ node, depth, runtime, installed, onDownload, onCancel, onDelete }) {
  const [open, setOpen] = useState(false)
  const hijos = node.hijos || []
  const estado = estadoVisible(node, runtime, installed)
  const tieneHijos = hijos.length > 0

  return (
    <div className="pkg-node" style={{ marginLeft: depth ? '0.75rem' : 0 }}>
      <div className="pkg-node-row">
        {tieneHijos ? (
          <button
            type="button"
            className="pkg-icon-btn"
            aria-expanded={open}
            aria-label={open ? `Cerrar ${node.nombre}` : `Abrir ${node.nombre}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <MdExpandMore aria-hidden /> : <MdChevronRight aria-hidden />}
          </button>
        ) : (
          <span className="pkg-icon-btn pkg-icon-btn--ghost" aria-hidden>
            <MdInventory2 />
          </span>
        )}

        <div className="pkg-node-body">
          <strong>{node.nombre}</strong>
          <span className="pkg-node-meta">{meta(node)}</span>
          {node.nota && !node.formato && <span className="pkg-node-note">{node.nota}</span>}
          {estado.status === 'installed' && (
            <span className="package-offline-chip"><MdCheckCircle aria-hidden /> Guardado en este navegador</span>
          )}
          {estado.status === 'downloading' && (
            <div className="package-progress" role="progressbar" aria-valuenow={Math.round(estado.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="package-progress-bar"><div style={{ width: `${Math.round(estado.progress * 100)}%` }} /></div>
              <span>{Math.round(estado.progress * 100)}%</span>
            </div>
          )}
          {estado.status === 'error' && (
            <span className="package-error-text">No se pudo descargar. Reintenta.</span>
          )}
        </div>

        <div className="pkg-node-actions">
          {estado.status === 'installed' && (
            <button type="button" className="pkg-icon-btn" onClick={() => onDelete(node)} aria-label={`Eliminar ${node.nombre}`}>
              <MdDelete aria-hidden />
            </button>
          )}
          {estado.status === 'downloading' && (
            <button type="button" className="pkg-icon-btn" onClick={onCancel} aria-label={`Cancelar la descarga de ${node.nombre}`}>
              <MdClose aria-hidden />
            </button>
          )}
          {estado.status === 'available' && (
            <button type="button" className="pkg-icon-btn pkg-icon-btn--accent" onClick={() => onDownload(node)} aria-label={`Descargar ${node.nombre}`}>
              <MdDownload aria-hidden />
            </button>
          )}
          {estado.status === 'error' && (
            <button type="button" className="pkg-icon-btn pkg-icon-btn--danger" onClick={() => onDownload(node)} aria-label={`Reintentar ${node.nombre}`}>
              <MdRefresh aria-hidden />
            </button>
          )}
        </div>
      </div>
      {tieneHijos && open && (
        <div className="pkg-children">
          {hijos.map((hijo) => (
            <NodeRow
              key={hijo.id}
              node={hijo}
              depth={depth + 1}
              runtime={runtime}
              installed={installed}
              onDownload={onDownload}
              onCancel={onCancel}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PackageAccordion({ paises, runtime, installed, onDownload, onCancel, onDelete }) {
  if (!paises.length) return null
  return (
    <div className="pkg-acc">
      {paises.map((pais) => (
        <NodeRow
          key={pais.id}
          node={pais}
          depth={0}
          runtime={runtime}
          installed={installed}
          onDownload={onDownload}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
