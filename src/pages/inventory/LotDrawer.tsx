import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { useInventoryLots } from '@/hooks/useInventoryLots'
import { formatDate } from '@/lib/formatDate'
import type { Product } from '@/types'

interface LotDrawerProps {
  product: Product | null
  onClose: () => void
}


export function LotDrawer({ product, onClose }: LotDrawerProps) {
  const { data: lots = [], isLoading } = useInventoryLots(product?.id ?? null)

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={product ? `Lotes — ${product.name}` : 'Lotes'}
      size="lg"
    >
      {isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Cargando...</p>
      ) : lots.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No hay lotes registrados para este producto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left pb-2 font-medium text-[var(--color-muted)]">Recibido</th>
                <th className="text-right pb-2 font-medium text-[var(--color-muted)]">Inicial</th>
                <th className="text-right pb-2 font-medium text-[var(--color-muted)]">Restante</th>
                <th className="text-right pb-2 font-medium text-[var(--color-muted)]">Costo unit.</th>
                <th className="pb-2 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              {lots.map(lot => (
                <tr key={lot.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="py-2 pr-4 text-[var(--color-muted)]">{formatDate(lot.received_date)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{Number(lot.initial_quantity).toLocaleString('es-CO')}</td>
                  <td className="py-2 pr-4 text-right tabular-nums font-medium">{Number(lot.remaining_quantity).toLocaleString('es-CO')}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">${Number(lot.unit_cost).toLocaleString('es-CO')}</td>
                  <td className="py-2 pl-3">
                    {Number(lot.remaining_quantity) === 0 ? (
                      <Badge variant="default">Agotado</Badge>
                    ) : (
                      <Badge variant="success">Disponible</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
