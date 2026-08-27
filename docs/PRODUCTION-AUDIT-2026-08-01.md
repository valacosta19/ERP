# Auditoría integral para salida a producción

**Fecha:** 1 de agosto de 2026  
**Alcance:** código, seguridad, rendimiento, legibilidad, contabilidad, UX y accesibilidad.  
**Método:** revisión completa y solo de lectura del repositorio por tres análisis especializados, más compilación y lint local.

## Conclusión ejecutiva

El proyecto tiene una base funcional valiosa: compila, posee inventario FIFO, carga rápida offline, recuentos controlados y documentación de negocio superior a la habitual. Sin embargo, **todavía no está listo para ser la única fuente de verdad en producción**.

Puede evolucionar primero hacia una herramienta operativa confiable. Para considerarlo además un sistema contable formal necesita una etapa posterior: hoy no hay libro mayor de doble partida, tratamiento fiscal argentino completo ni balances históricos rigurosos.

### Estado actual

| Área | Estado | Lectura simple |
|---|---|---|
| Funcionamiento general | 🟡 | Compila, pero el control de calidad falla. |
| Seguridad | 🔴 | Hay secretos y operaciones privilegiadas que deben protegerse. |
| Integridad de datos | 🔴 | Algunas operaciones financieras pueden quedar a medio guardar. |
| Contabilidad formal | 🔴 | No hay doble partida ni módulo fiscal. |
| Rendimiento | 🟡 | Funcionará con pocos datos, pero se degradará al crecer. |
| UX | 🟡 | Es utilizable, pero falla el feedback y la adaptación móvil en flujos clave. |
| Accesibilidad | 🔴 | Modales, edición y navegación tienen barreras de teclado/lector. |
| Pruebas y despliegue | 🔴 | No hay tests automatizados ni CI. |

## Bloqueantes para producción

### Seguridad e integridad

1. **La clave de Gemini queda expuesta en el navegador.** Cualquier persona con acceso puede copiarla y consumir la cuota. Debe moverse a una función de servidor y rotarse. Evidencia: `src/lib/gemini.ts:18-31`.
2. **Funciones con privilegios confían en datos enviados por el navegador.** Un usuario autenticado podría falsificar autoría, montos o comisiones llamando la API directamente. La base debe obtener la identidad desde la sesión y validar permisos y valores. Evidencia: `supabase/migrations/060_funnel_idempotency_race_fix.sql:17-82`, `061_staff_offline_advance.sql:39-232`.
3. **Los permisos de algunos empleados son demasiado amplios.** Hoy usuarios autenticados pueden modificar costos/recetas/catálogo o borrar pagos mediante la API aunque la pantalla esté oculta. Evidencia: migraciones `008`, `014` y `025`.
4. **Varias operaciones financieras no son atómicas.** Crear o editar transacciones, pagar proveedores, cobrar deudas o mover fondos se realiza en varios pasos. Si falla internet o hay dos usuarios, puede quedar caja sin deuda, deuda sin pago o información parcial. Evidencia: `useTransactions.ts`, `useSupplierDebts.ts`, `useReceivables.ts`, `useStaffReceivables.ts`, `useReserveMovements.ts`.
5. **Anular una venta no revierte el inventario y puede seguir afectando la utilidad.** Esto desalineará stock, ventas y reportes. Se necesita una reversa trazable desde base de datos; mientras tanto conviene bloquear estas anulaciones. Evidencia: `useTransactions.ts:245-260`, `useReports.ts:254-315`.

### Contabilidad

6. **No existe doble partida.** Los movimientos son registros aislados, sin demostrar que cada operación tenga contrapartida. El “patrimonio” se calcula por diferencia. Sirve para gestión, no como contabilidad formal. Evidencia: `docs/roadmap/double-entry-migration.md`, `useReports.ts:213-217`.
7. **El “balance a fecha” mezcla épocas.** La fecha elegida se aplica a caja, pero inventario y deudas se toman al valor actual. Un balance histórico puede ser materialmente incorrecto. Evidencia: `useReports.ts:170-217`.
8. **El cierre mensual es incompleto.** Protege transacciones, pero no todos sus pagos, cobros, deudas, comisiones o movimientos de inventario. Un mes cerrado todavía puede cambiar. Evidencia: migración `033_locked_periods.sql`.
9. **La conversión de monedas no conserva la cotización histórica.** Usa el dólar actual, EUR puede tratarse como ARS y algunos totales mezclan monedas. Los resultados pueden cambiar solo por volver a abrir el reporte otro día. Evidencia: `useReports.ts:191-315`.
10. **No hay modelo fiscal argentino.** Faltan IVA, retenciones/percepciones, CUIT, condición fiscal y comprobantes. Debe aclararse que el sistema no reemplaza al sistema fiscal ni al contador.

### Calidad y operación

11. **No hay pruebas automatizadas.** FIFO, pagos, anticipos, cierres y reportes pueden romperse sin que el equipo lo detecte. `package.json` no incluye un comando de tests.
12. **El lint falla actualmente:** 9 errores y 3 advertencias. La compilación pasa, pero el gate de calidad está rojo.
13. **No hay CI ni un proceso reproducible de migraciones.** Las migraciones se aplican manualmente, hay numeración duplicada `051` y producción puede terminar con una base distinta al código.
14. **Muchas operaciones no informan claramente éxito o error.** Ante mala conexión, la persona puede repetir un cobro o pago creyendo que no se guardó. Esto es un riesgo operativo, no solo visual.

## Problemas importantes a resolver después de los bloqueantes

### Código, rendimiento y mantenimiento

- Reportes y balances descargan grandes historiales y calculan en el navegador. Deben agregarse y filtrarse en la base.
- La lista de transacciones no está paginada y será más lenta a medida que crezcan los datos.
- El bundle principal pesa aproximadamente **1,59 MB** (456 KB comprimido). Reportes, XLSX e IA deberían cargarse solo cuando se visitan.
- La cola offline guarda tickets financieros en `localStorage` sin separar claramente usuario/empresa; otro inicio de sesión en el mismo equipo podría reenviar tickets previos.
- Hay seis funciones privilegiadas sin una configuración segura y explícita de búsqueda de tablas (`search_path`).
- Archivos muy grandes concentran demasiado riesgo: Settings (~1.678 líneas), Reports (~1.216), Purchase Orders (~1.174) y Transactions (~803).
- Los errores actuales de lint incluyen estados derivados mediante efectos, una referencia modificada durante render y código/dependencias obsoletas.
- La configuración de Supabase no valida de forma explícita que las variables obligatorias existan al arrancar.

### Consistencia contable

- Cuentas por pagar/cobrar permiten potencialmente importes negativos, sobrepagos y carreras entre usuarios; el saldo se duplica entre acumulados y detalle.
- Anticipos no están gestionados como saldo por cliente y moneda; se infieren por categoría y desde una fecha fija.
- Ajustes de inventario cambian el activo sin registrar automáticamente merma o sobrante en resultados.
- La recepción parcial de compras usa la fecha del servidor y puede cerrar la orden como recibida aunque falten productos.
- Editar una transacción no regenera de forma segura el costo histórico de su receta.
- Fondos reservados no registran claramente de qué caja salen o a cuál vuelven.
- La auditoría es parcial: varias operaciones no dejan un historial completo y atómico de quién cambió qué y por qué.
- Transacciones sin categoría pueden desaparecer o clasificarse mal en algunos reportes.
- La valuación histórica de inventario usa el stock actual; un ajuste de hoy puede alterar la lectura de un mes anterior.
- Cuando todos los lotes se agotan, algunos costos de recetas pueden caer a cero.

### UX y accesibilidad

- Los modales no gestionan correctamente foco, teclado ni lector de pantalla.
- La edición inline no se puede iniciar bien con teclado y puede cerrarse aunque el guardado falle.
- Carga Rápida deshabilita “Continuar” sin mostrar siempre qué dato falta.
- Reportes, Configuración y Cuentas tienen pestañas, columnas o tablas que se recortan en móvil.
- Los campos no asocian sus errores con tecnologías de asistencia.
- Los estados de carga no se anuncian de forma accesible.
- El menú móvil no informa si está abierto ni maneja Escape/foco.
- Las pestañas son solo botones visuales y no exponen su estado correctamente.
- El asistente de IA puede tapar la pantalla en móvil y varios controles no tienen nombre accesible.
- Algunos mensajes muestran detalles técnicos en vez de explicar qué ocurrió y cómo continuar.
- Confirmaciones destructivas, vacíos y mensajes de éxito/error son inconsistentes.
- Algunos textos tienen poco contraste y varios objetivos táctiles son pequeños.
- `index.html` declara idioma inglés y usa un título genérico, aunque la interfaz está en español.

## Fortalezas que conviene conservar

- FIFO se ejecuta en base de datos y bloquea lotes durante el consumo.
- La carga rápida reciente es atómica e idempotente y posee cola offline.
- `sale_items` conserva el costo histórico del lote consumido.
- El recuento de inventario es administrativo, atómico, idempotente y respeta el cierre.
- Existe separación específica para pagos de órdenes de compra y costo de mercadería.
- La navegación principal es clara y la documentación describe varias reglas críticas.
- La tabla compartida ya resuelve carga, vacío, paginación y desplazamiento horizontal.

## Plan recomendado

### Etapa 0 — Congelar riesgos (2–3 días)

- No promover el estado actual como contabilidad formal o sistema fiscal.
- Hacer respaldo completo de base y probar restauración.
- Rotar y proteger la clave de Gemini.
- Bloquear temporalmente anulaciones de ventas con FIFO.
- Definir un ambiente de staging separado de producción.

### Etapa 1 — Producción operativa segura (1–2 semanas)

- Corregir permisos/RPCs y usar la identidad real de la sesión.
- Convertir anulaciones en reversas trazables.
- Hacer atómicos e idempotentes transacciones, CxP, CxC, comisiones y fondos.
- Agregar límites de sobrepago, importes positivos y protección ante doble clic/concurrencia.
- Corregir el balance “a fecha” o retirarlo hasta que sea histórico de verdad.
- Corregir todos los errores de lint.
- Implementar mensajes uniformes de éxito/error y conservar formularios si una operación falla.

### Etapa 2 — Red de seguridad (1–2 semanas)

- Tests de permisos, FIFO, anulación, idempotencia, pagos/cobros, anticipos, cierres y reportes.
- CI obligatoria con lint, typecheck, tests, build y migraciones en una base temporal.
- Flujo reproducible de migraciones con Supabase CLI; resolver numeración duplicada.
- Monitoreo de errores y registro de auditoría centralizado.

### Etapa 3 — Escala y UX (2–4 semanas)

- Paginación y agregaciones en la base para reportes/transacciones.
- Carga diferida de rutas y librerías pesadas.
- Separar las cuatro páginas monolíticas por función.
- Mejorar componentes compartidos: Modal, InlineEdit, Input/Select, Tabs, notificaciones y confirmaciones.
- QA en teléfonos/tablets reales, teclado y lector de pantalla.

### Etapa 4 — Contabilidad formal (6–12 semanas, con contador)

- Libro mayor de doble partida y plan de cuentas.
- Cotización histórica por operación y auxiliares por moneda.
- Anticipos por cliente, contrapartidas de inventario y conciliación de caja/bancos.
- Cierre transversal con reversas, snapshots y reportes desde el libro mayor.
- Definir alcance fiscal argentino y comprobantes junto a un profesional contable.

## Criterio de salida a producción

No debería aprobarse el go-live hasta cumplir todos estos puntos:

- CI completamente verde y pruebas críticas pasando.
- Ninguna función privilegiada accesible sin el rol correcto.
- Ningún secreto privado dentro del navegador.
- Simulación de corte/restauración y recuperación ante fallos aprobada.
- Cero diferencias entre caja y pagos, inventario y lotes, CxP y pagos, CxC y cobros, anticipos y aplicaciones.
- Anulaciones probadas de punta a punta sin alterar silenciosamente stock o utilidad.
- Dos cierres paralelos comparados contra las planillas actuales y revisados con contador.
- Si se implementa doble partida: todo asiento debe cumplir **Debe = Haber**.

## Controles ejecutados

- `npm run build`: **pasa**; advierte bundle principal mayor a 500 KB.
- `npm run lint`: **falla** con 9 errores y 3 advertencias.
- Pruebas automatizadas: **no existen**.
- Cambios realizados durante la auditoría: únicamente este reporte; no se modificó código ni se alteraron los cambios locales existentes.
