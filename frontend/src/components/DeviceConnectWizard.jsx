import {
  MdSmartphone, MdCheckCircle, MdBluetoothConnected,
  MdLinkOff,
} from 'react-icons/md'
import LoadingSpinner from './LoadingSpinner'
import { usePackagesStore } from '../store/packagesStore'
import './DeviceConnectWizard.css'

const STEPS = ['searching', 'found', 'connecting', 'syncing', 'connected']

/**
 * Simulación del flujo "conectar celular" para gestionar paquetes desde la
 * web: Seleccionar dispositivo → Buscar → Encontrado → Conectando →
 * Sincronizando → Conectado. No existe integración real (ni protocolo ni
 * backend) — es intencional, ver nota en Packages.jsx.
 */
export default function DeviceConnectWizard() {
  const { deviceStep, device, connectDevice, confirmDevice, disconnectDevice } = usePackagesStore()

  if (deviceStep === 'idle') {
    return (
      <div className="device-wizard card device-wizard--idle">
        <MdSmartphone className="device-wizard-icon" aria-hidden />
        <h3>Ningún dispositivo conectado</h3>
        <p>Conecta tu celular para ver y sincronizar los paquetes que tienes instalados ahí.</p>
        <button type="button" className="btn-primary" onClick={connectDevice}>
          Conectar dispositivo
        </button>
      </div>
    )
  }

  if (deviceStep === 'searching') {
    return (
      <div className="device-wizard card">
        <LoadingSpinner text="Buscando dispositivos cercanos…" />
      </div>
    )
  }

  if (deviceStep === 'found') {
    return (
      <div className="device-wizard card">
        <MdBluetoothConnected className="device-wizard-icon device-wizard-icon--ok" aria-hidden />
        <h3>Dispositivo encontrado</h3>
        <p className="device-wizard-device-name">{device?.name}</p>
        <p className="device-wizard-device-model">{device?.model}</p>
        <button type="button" className="btn-primary" onClick={confirmDevice}>
          Conectar
        </button>
      </div>
    )
  }

  if (deviceStep === 'connecting') {
    return (
      <div className="device-wizard card">
        <LoadingSpinner text={`Conectando con ${device?.name}…`} />
      </div>
    )
  }

  if (deviceStep === 'syncing') {
    return (
      <div className="device-wizard card">
        <LoadingSpinner text="Sincronizando paquetes…" />
      </div>
    )
  }

  // connected
  return (
    <div className="device-wizard card device-wizard--connected">
      <div className="device-wizard-connected-header">
        <MdCheckCircle className="device-wizard-icon device-wizard-icon--ok" aria-hidden />
        <div>
          <h3>{device?.name}</h3>
          <p className="device-wizard-device-model">Conectado y sincronizado</p>
        </div>
        <button type="button" className="device-wizard-disconnect" onClick={disconnectDevice} title="Desconectar">
          <MdLinkOff aria-hidden />
        </button>
      </div>
      <p className="device-wizard-hint">Los paquetes que instales o elimines aquí se reflejan en este dispositivo la próxima vez que abras la app.</p>
    </div>
  )
}
