import { Component } from 'react'

// No existía ningún error boundary: un error de render en cualquier
// pantalla tumbaba toda la SPA a blanco sin explicación.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="auth-view">
          <div className="auth-card card" style={{ textAlign: 'center' }}>
            <h1>🐸 Algo salió mal</h1>
            <p className="subtitle">Ocurrió un error inesperado en esta pantalla.</p>
            <button className="btn-primary" onClick={() => { this.setState({ error: null }); window.location.href = '/' }}>
              Volver al inicio
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
