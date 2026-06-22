# ERP-BO — Sistema de gestión para peluquería

ERP interno que reemplaza un sistema en Excel. Núcleo: costeo FIFO estricto de inventario, por lo que cada venta refleja el costo real del lote consumido.

**Stack:** React 19 + TypeScript + Vite · Supabase (Postgres + Auth) · TanStack Query · Tailwind CSS · Recharts

En producción desde fase 8. Fase actual: 28.

---

## Arrancar el proyecto

```bash
cp .env.example .env   # completar con las credenciales de Supabase
npm install
npm run dev            # dev server con HMR en http://localhost:5173
```

Variables de entorno requeridas:

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anon pública de Supabase |
| `VITE_GEMINI_API_KEY` | API key de Gemini (AI Widget) — expuesta en el bundle, ver `docs/backlog.md` |

## Comandos

```bash
npm run build   # tsc + vite build — debe salir en 0 antes de cualquier commit
npm run lint    # eslint sobre todo .ts/.tsx
npm run dev     # servidor de desarrollo
```

---

## Estructura del código

```
src/
  pages/       → una carpeta por ruta (componente de página + modales locales)
  hooks/       → un useX (query) + useCreateX/useUpdateX/useDeleteX (mutations) por dominio
  components/  → ui/ (primitivos reutilizables) · layout/ · transactions/QuickFunnel/
  lib/         → supabaseClient, fetchAllRows, gemini, buildSystemPrompt
  types/       → database.ts (schema Supabase) · index.ts (tipos de dominio)
supabase/
  migrations/  → 61 migraciones numeradas; aplicar manualmente en Supabase SQL editor
```

Patrón de datos: Postgres → `supabaseClient.ts` → `hooks/` (TanStack Query) → `pages/` (sin llamadas directas a Supabase en componentes).

---

## Documentación

| Doc | Qué contiene |
|-----|-------------|
| [`CLAUDE.md`](./CLAUDE.md) | Instrucciones para la IA: comandos, reglas de negocio, convenciones de código, fase actual |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | **Mapa por módulo: archivos, tablas/RPCs, invariantes que no se pueden rompen** — leer antes de tocar una feature |
| [`docs/accounting.md`](./docs/accounting.md) | Manual contable: FIFO, valuación, cálculo de comisiones, reportes — para auditoría o referencia |
| [`PROJECT_STATE.md`](./PROJECT_STATE.md) | Estado actual del proyecto: fase en curso, deuda técnica abierta |
| [`docs/backlog.md`](./docs/backlog.md) | Features pendientes priorizadas |
| [`docs/roadmap/`](./docs/roadmap/) | Iniciativas planificadas a futuro (no en sprint) |

---

## Validación manual

```bash
npm run build   # 0 errores
npm run dev     # verificar en el browser:
```

- `/login` — auth funciona, redirige correctamente
- `/transactions` — lista carga, crear/editar inline, tarjetas de balance por método y moneda
- `/suppliers` — CRUD funciona
- `/purchase-orders` — crear PO (con flete + sugerencia de reposición), recepción parcial, stock sube en `/inventory`
- `/inventory` — stock correcto, drawer de lote abre inline-editable, venta descuenta stock
- `/cuentas` — tabs "Por pagar" y "Por cobrar" (solo admin)
- `/reportes` — tabs Financiero, Comisiones, Sueldos, Utilidad, Costos, Valoración
