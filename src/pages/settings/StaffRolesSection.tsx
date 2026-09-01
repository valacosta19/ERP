import { useRef, useState } from 'react'
import { Plus, Check, X, Trash2 } from 'lucide-react'
import { InlineEditCell } from '@/components/ui/InlineEditCell'
import { useStaffRoles, useCreateStaffRole, useUpdateStaffRole, useDeleteStaffRole } from '@/hooks/useStaffRoles'
import { confirmDialog } from '@/lib/confirm'
import { showToast } from '@/lib/toast'

export function StaffRolesSection() {
  const { data: roles = [] } = useStaffRoles()
  const createRole = useCreateStaffRole()
  const updateRole = useUpdateStaffRole()
  const deleteRole = useDeleteStaffRole()

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function save() {
    const name = draft.trim()
    if (!name) return
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      showToast('Ya existe un rol con ese nombre.')
      return
    }
    await createRole.mutateAsync(name)
    setDraft('')
    setAdding(false)
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirmDialog({
      title: `Eliminar el rol "${name}"`,
      message: 'Las profesionales que lo tengan asignado quedan sin rol.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    await deleteRole.mutateAsync(id)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Roles</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            "Atiende" define si el rol aparece al cargar un servicio; "Comisiona" si se le puede asignar un % de comisión.
          </p>
        </div>
        <button
          onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          disabled={adding}
          className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline disabled:opacity-40"
        >
          <Plus size={12} /> Nuevo
        </button>
      </div>
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {roles.length === 0 && !adding && (
          <p className="px-4 py-3 text-sm text-[var(--color-muted)]">Sin roles</p>
        )}
        {roles.map(role => (
          <div key={role.id} className="flex items-center justify-between px-4 py-3">
            <InlineEditCell
              value={role.name}
              onSave={async v => { await updateRole.mutateAsync({ id: role.id, name: v }) }}
              className="text-sm text-[var(--color-text)]"
            />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={role.assigns_services}
                  onChange={e => void updateRole.mutateAsync({ id: role.id, assigns_services: e.target.checked })}
                  className="accent-[var(--color-accent)]"
                />
                Atiende
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={role.earns_commission}
                  onChange={e => void updateRole.mutateAsync({ id: role.id, earns_commission: e.target.checked })}
                  className="accent-[var(--color-accent)]"
                />
                Comisiona
              </label>
              <button
                onClick={() => void handleDelete(role.id, role.name)}
                className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {adding && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 animate-slide-in"
            style={{ background: 'var(--color-accent-light)', borderLeft: '3px solid var(--color-accent)' }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setDraft(''); setAdding(false) } }}
              placeholder="Nombre del rol"
              className="flex-1 px-2 py-1 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              onClick={() => void save()}
              disabled={createRole.isPending || !draft.trim()}
              className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => { setDraft(''); setAdding(false) }}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-light)] transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
