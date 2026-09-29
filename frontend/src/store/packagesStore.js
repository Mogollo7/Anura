import { create } from 'zustand'

/**
 * Catálogo real de paquetes: GET /api/dataset/publico/paquetes.
 * Cada nodo con archivo se baja de verdad (sqlite de identificación o JSON de subregión),
 * se comprueba el sha256 y se guarda en IndexedDB. Un país o un departamento sin archivo
 * propio dispara la descarga de sus hijos.
 */

const DB_NAME = 'anura-paquetes'
const STORE = 'archivos'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readInstalled() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).openCursor()
    const out = {}
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return
      if (cursor.value?.sha256) {
        out[cursor.key] = { sha256: cursor.value.sha256, version: cursor.value.version || null }
      }
      cursor.continue()
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

async function saveInstalled(id, record) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function forgetInstalled(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function archivosDe(node) {
  const out = []
  if (node?.archivo_url && node.sha256) out.push(node)
  for (const hijo of node?.hijos || []) out.push(...archivosDe(hijo))
  return out
}

export function findNode(nodos, id) {
  for (const node of nodos || []) {
    if (node.id === id) return node
    const hijo = findNode(node.hijos, id)
    if (hijo) return hijo
  }
  return null
}

/** Estado que ve la fila: el del archivo, o el resumen de los hijos si el nodo no tiene archivo. */
export function estadoVisible(node, runtime, installed) {
  const files = archivosDe(node)
  if (files.length === 0) return { status: 'available', progress: 0 }
  if (files.some((f) => runtime[f.id]?.status === 'downloading')) {
    const progress = files.reduce((sum, f) => {
      if (runtime[f.id]?.status === 'downloading') return sum + (runtime[f.id].progress || 0)
      if (installed[f.id]?.sha256 === f.sha256) return sum + 1
      return sum
    }, 0) / files.length
    return { status: 'downloading', progress }
  }
  if (files.every((f) => installed[f.id]?.sha256 === f.sha256)) return { status: 'installed', progress: 1 }
  if (files.some((f) => runtime[f.id]?.status === 'error')) return { status: 'error', progress: 0 }
  return { status: 'available', progress: 0 }
}

function hexSha(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function downloadFile(node, signal, onProgress) {
  const res = await fetch(node.archivo_url, { signal })
  if (!res.ok || !res.body) throw new Error('El servidor no entregó el archivo')
  const total = Number(res.headers.get('content-length')) || node.size_bytes || 0
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (total > 0) onProgress(Math.min(received / total, 0.99))
  }
  const blob = new Blob(chunks)
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const sha256 = hexSha(digest)
  if (sha256 !== node.sha256) throw new Error('El archivo no coincide con el sha256 publicado')
  await saveInstalled(node.id, { sha256, version: node.version, blob, savedAt: new Date().toISOString() })
  onProgress(1)
}

export const usePackagesStore = create((set, get) => ({
  paises: [],
  load: 'idle',
  installed: {},
  runtime: {},
  abort: null,

  refresh: async () => {
    set({ load: 'loading' })
    try {
      const [res, installed] = await Promise.all([
        fetch('/api/dataset/publico/paquetes'),
        readInstalled().catch(() => ({})),
      ])
      if (!res.ok) throw new Error('catálogo')
      const body = await res.json()
      const paises = Array.isArray(body.paises) ? body.paises : []
      const vigentes = {}
      for (const [id, row] of Object.entries(installed)) {
        const node = findNode(paises, id)
        if (node?.sha256 && node.sha256 === row.sha256) vigentes[id] = row
      }
      set({ paises, installed: vigentes, load: 'ready' })
    } catch {
      set({ paises: [], load: 'error' })
    }
  },

  startDownload: async (id) => {
    const { paises, runtime, abort } = get()
    const node = findNode(paises, id)
    if (!node) return
    const files = archivosDe(node).filter((f) => get().installed[f.id]?.sha256 !== f.sha256)
    if (files.length === 0) return
    if (files.some((f) => runtime[f.id]?.status === 'downloading')) return
    abort?.abort()
    const controller = new AbortController()
    set({ abort: controller })
    for (const file of files) {
      if (controller.signal.aborted) return
      set((state) => ({
        runtime: { ...state.runtime, [file.id]: { status: 'downloading', progress: 0 } },
      }))
      try {
        await downloadFile(file, controller.signal, (progress) => {
          set((state) => ({
            runtime: {
              ...state.runtime,
              [file.id]: { status: 'downloading', progress },
            },
          }))
        })
        set((state) => {
          const nextRuntime = { ...state.runtime }
          delete nextRuntime[file.id]
          return {
            runtime: nextRuntime,
            installed: { ...state.installed, [file.id]: { sha256: file.sha256, version: file.version } },
          }
        })
      } catch (err) {
        if (controller.signal.aborted || err?.name === 'AbortError') {
          set((state) => {
            const nextRuntime = { ...state.runtime }
            delete nextRuntime[file.id]
            return { runtime: nextRuntime }
          })
          return
        }
        set((state) => ({
          runtime: { ...state.runtime, [file.id]: { status: 'error', progress: 0 } },
        }))
      }
    }
  },

  cancelDownload: () => {
    get().abort?.abort()
    set((state) => {
      const runtime = {}
      for (const [id, row] of Object.entries(state.runtime)) {
        if (row.status !== 'downloading') runtime[id] = row
      }
      return { runtime, abort: null }
    })
  },

  uninstallPackage: async (id) => {
    const node = findNode(get().paises, id)
    const ids = (node ? archivosDe(node) : [{ id }]).map((f) => f.id)
    for (const fileId of ids) {
      await forgetInstalled(fileId).catch(() => {})
    }
    set((state) => {
      const installed = { ...state.installed }
      const runtime = { ...state.runtime }
      for (const fileId of ids) {
        delete installed[fileId]
        delete runtime[fileId]
      }
      return { installed, runtime }
    })
  },

  // El emparejamiento web↔teléfono no existe. El asistente sigue en el código
  // por si se abre, pero la pantalla de paquetes ya no lo presenta como entrega.
  device: null,
  deviceStep: 'idle',
  connectDevice: () => {
    set({ deviceStep: 'searching', device: null })
    setTimeout(() => set({ deviceStep: 'found', device: { name: 'Galaxy A54', model: 'Samsung SM-A546E' } }), 1400)
  },
  confirmDevice: () => {
    set({ deviceStep: 'connecting' })
    setTimeout(() => set({ deviceStep: 'syncing' }), 1300)
    setTimeout(() => set((state) => ({
      deviceStep: 'connected',
      device: state.device ? { ...state.device, connected: true } : state.device,
    })), 2600)
  },
  disconnectDevice: () => set({ deviceStep: 'idle', device: null }),
}))
