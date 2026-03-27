import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Package,
  ShoppingCart,
  Truck,
  BarChart2,
  FileSpreadsheet,
  Settings,
  Scissors,
  LogOut,
  PiggyBank,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/transactions', icon: <ArrowLeftRight size={18} />, label: 'Transacciones' },
  { to: '/inventory', icon: <Package size={18} />, label: 'Inventario' },
  { to: '/purchase-orders', icon: <ShoppingCart size={18} />, label: 'Pedidos' },
  { to: '/suppliers', icon: <Truck size={18} />, label: 'Proveedores' },
  { to: '/reports', icon: <BarChart2 size={18} />, label: 'Reportes' },
  { to: '/fondos', icon: <PiggyBank size={18} />, label: 'Fondos', adminOnly: true },
  { to: '/import', icon: <FileSpreadsheet size={18} />, label: 'Importar', adminOnly: true },
  { to: '/settings', icon: <Settings size={18} />, label: 'Ajustes', adminOnly: true },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'

  return (
    <aside className="sidebar w-56 min-h-screen bg-[var(--color-sidebar)] flex flex-col shrink-0">
      <div className="sidebar__brand px-5 py-6 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="sidebar__brand-icon w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
            <Scissors size={16} className="text-white" />
          </div>
          <div className="sidebar__brand-text">
            <p className="text-white font-semibold text-sm leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {profile?.business_name ?? ''}
            </p>
          </div>
        </div>
      </div>

      <nav className="sidebar__nav flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map(item => {
          if (item.adminOnly && !isAdmin) return null
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''} flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 animate-slide-in
                 ${isActive
                   ? 'bg-[var(--color-sidebar-active)] text-white'
                   : 'text-white/50 hover:text-white/90 hover:bg-[var(--color-sidebar-hover)]'
                 }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="sidebar__footer px-3 py-4 border-t border-white/5">
        <div className="sidebar__user px-3 py-2 mb-1">
          <p className="text-white/90 text-sm font-medium truncate">{profile?.full_name ?? 'Usuario'}</p>
          <p className="text-white/35 text-xs capitalize">{profile?.role ?? ''}</p>
        </div>
        <button
          onClick={signOut}
          className="sidebar__logout w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/80 hover:bg-[var(--color-sidebar-hover)] transition-all duration-150"
        >
          <LogOut size={16} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
