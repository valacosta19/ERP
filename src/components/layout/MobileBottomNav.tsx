import { NavLink } from 'react-router-dom'
import { ArrowLeftRight, BarChart2, BookOpen, Package } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const items = [
  { to: '/transactions', label: 'Transacciones', icon: ArrowLeftRight },
  { to: '/inventory', label: 'Inventario', icon: Package },
  { to: '/reports', label: 'Reportes', icon: BarChart2 },
  { to: '/cuentas', label: 'Cuentas', icon: BookOpen, adminOnly: true },
]

export function MobileBottomNav() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label="Navegación principal móvil">
      {items.map(({ to, label, icon: Icon, adminOnly }) => {
        if (adminOnly && !isAdmin) return null
        return (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'mobile-bottom-nav__item--active' : ''}`}
          >
            <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
