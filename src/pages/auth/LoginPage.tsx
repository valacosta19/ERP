import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Scissors, Mail, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error } = await signIn(email, password)
    if (error) setError('Credenciales incorrectas. Intenta de nuevo.')
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-1/2 bg-[var(--color-sidebar)] flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-full h-full"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, #6366F1 0%, transparent 60%), radial-gradient(circle at 80% 20%, #818CF8 0%, transparent 50%)',
            }}
          />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)] flex items-center justify-center">
            <Scissors size={20} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>Buenas Ondas ERP</span>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Gestiona tu negocio<br />con precisión real.
          </h2>
          <p className="text-white/50 text-base leading-relaxed">
            Inventario FIFO, control de costos por lote,<br />y reportes de rentabilidad exactos.
          </p>
        </div>
        <div className="relative flex items-center gap-6">
          {[['Inventario', 'FIFO exacto'], ['Costos', 'Por lote'], ['Reportes', 'En tiempo real']].map(([title, sub]) => (
            <div key={title}>
              <p className="text-white/90 text-sm font-semibold">{title}</p>
              <p className="text-white/35 text-xs">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-[var(--color-bg)]">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
              <Scissors size={16} className="text-white" />
            </div>
            <span className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>Buenas Ondas ERP</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">Bienvenido de vuelta</h1>
            <p className="text-[var(--color-muted)] text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@estudio.com"
              prefix={<Mail size={14} />}
              required
              autoComplete="email"
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              prefix={<Lock size={14} />}
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-light)] px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting} size="lg" className="w-full justify-center mt-2">
              Iniciar sesión
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
