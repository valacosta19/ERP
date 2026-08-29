import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
  attempt: number
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '', attempt: 0 }
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState(prev => ({ hasError: false, message: '', attempt: prev.attempt + 1 }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
          <p className="text-[var(--color-danger)] font-semibold text-base">Ocurrió un error</p>
          <p className="text-sm text-[var(--color-muted)] max-w-sm">{this.state.message}</p>
          <button
            onClick={this.handleRetry}
            className="mt-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      )
    }
    return <div key={this.state.attempt} className="contents">{this.props.children}</div>
  }
}
