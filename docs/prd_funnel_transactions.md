# PRD — Funnel de Carga Rápida de Transacciones (rediseño UX del ERP)

**Producto:** Nueva experiencia dentro de la sección Transacciones del ERP existente
**Versión del documento:** v5 (borrador para revisión) — enfoque UX
**Autor:** Product Management
**Estado:** En revisión
**Fecha:** Junio 2026

---

## 1. Resumen ejecutivo

Las peluqueras registran cobros, compras de producto y otros movimientos de dinero en un cuaderno físico durante el día y, al cierre, los transcriben al ERP. Esto genera doble trabajo, errores y descuadres de caja.

La causa raíz es que **cargar una transacción en el ERP actual es lento** y exige escribir, algo inviable durante la operación diaria. Por eso recurren al cuaderno.

Este PRD propone una solución acotada y de alto impacto: un **funnel de carga rápida dentro de la sección "Transacciones" del ERP**, que permita registrar **cualquier tipo de transacción** (gasto, costo, ingreso, movimiento) en pocos toques, casi sin escribir — eligiendo de botones y dropdowns en lugar de tipear. Aunque el dolor más grande está en servicios y productos (los ingresos más frecuentes), la misma UX cubre todos los tipos para que toda la operación de caja sea igual de veloz.

El backend, el catálogo y la lógica de caja del ERP se reutilizan tal cual; lo que cambia es la experiencia de carga.

El objetivo es **eliminar el cuaderno** haciendo que registrar en el sistema sea tan rápido (o más) que anotar a mano.

---

## 2. Problema

- **Doble carga de datos.** Todo se anota en cuaderno y luego se transcribe al ERP.
- **La carga en el ERP es lenta.** Demasiados campos, escritura libre, navegación entre pantallas. No sirve para el ritmo de la operación.
- **Errores y descuadres.** La transcripción diferida introduce errores y pérdidas de registros.
- **Sin información en tiempo real.** No se ve la caja ni la facturación hasta el cierre del día.

## 3. Objetivos

| Objetivo | Métrica de éxito |
|---|---|
| Eliminar el cuaderno | 0 uso de cuaderno a las 4 semanas del lanzamiento |
| Hacer la carga más rápida que anotar a mano | Registro completo en ≤ 30 segundos y ≤ 8 toques |
| Minimizar la escritura | El camino feliz (servicios/productos) se completa sin teclear texto libre |
| Registro en tiempo real | 100% de transacciones cargadas en el momento en que ocurren |
| Reducir errores de caja | Descuadre diario promedio cercano a cero |

---

## 4. El funnel (flujo principal)

Una experiencia nueva dentro de la sección **Transacciones** del ERP, optimizada para velocidad. Sirve para **todos los tipos de transacción** y todos comparten la misma UI y los mismos principios. La persona la recorre como una secuencia lineal de pasos, resolviendo cada uno con botones/dropdowns.

**Paso 1 — Tipo de transacción.** Botones grandes para elegir: **Ingreso · Gasto · Costo · Movimiento**. La selección define el resto del flujo. Los tipos más usados (ej. Ingreso) quedan destacados para acceso inmediato.

**Paso 2 — Detalle según el tipo (UI compartida).**
- **Ingreso (servicios/productos):** seleccionar uno o más servicios desde el catálogo vía dropdown/grilla de botones, con los más frecuentes destacados a un toque. Opción de agregar productos (cantidad con botones +/−), descontando stock. Precios traídos del catálogo.
- **Gasto / Costo / Movimiento:** seleccionar la categoría desde un dropdown de **categorías preconfiguradas** (ej. Gasto → "Compra de agua"). En estos tipos **sí se tipea** lo necesario (concepto/monto puntual), pero con la misma mecánica de selección rápida y la misma UI.

**Paso 3 — Monto.** El total se **calcula automáticamente** desde el catálogo para servicios/productos. En todos los casos existe una **opción rápida para editar el precio/monto a mano** (no es el camino por defecto, pero está a un toque). Para gastos/costos/movimientos sin precio de catálogo, el monto se ingresa directamente.

**Paso 4 — Ajustes opcionales.**
- **Descuento libre:** se puede aplicar cualquier monto o porcentaje de descuento. No requiere permiso especial.
- **Propina (solo en servicios):** opción para registrarla; **"No" por defecto**.

**Paso 5 — Registrar pago (para ingresos).** Medio de pago por botones, tomados de los **"métodos de pago" ya configurados en el ERP** (no es una lista fija del funnel). Soporta **pago dividido** entre métodos. Para efectivo se ingresa **monto recibido** y el sistema **calcula el cambio**; para los demás métodos, el monto cobrado. Si el servicio tiene **anticipos** registrados, se imputan automáticamente al total: si cubren el 100%, el servicio se marca como **pagado** sin cobrar de nuevo; si cubren una parte, solo se cobra el saldo.

**Paso 6 — Cierre.** Confirmación visible (ej. "Cobrado $X, cambio $Y"), la transacción queda registrada en el ERP en tiempo real y se vuelve al inicio para el siguiente registro.

### Principios de UX
- **UI compartida para todos los tipos:** una sola interfaz, mismo patrón de interacción para ingreso, gasto, costo y movimiento.
- **Mínima escritura:** el camino feliz de servicios/productos no requiere teclear texto libre; en gastos/costos se tipea lo mínimo indispensable.
- **Precio editable, pero no por defecto:** el precio viene del catálogo; cambiarlo es posible y rápido, a un toque.
- **Pocos toques:** cada paso resoluble con uno o dos toques; lo frecuente, a un toque.
- **Lineal y sin callejones:** avanzar/retroceder claro; nada de menús profundos.
- **Optimizado para laptop pequeña:** controles cómodos y legibles en pantalla chica, navegable con teclado/trackpad, sin depender de gestos táctiles.
- **Atajos para lo común:** servicios, productos y categorías de gasto más frecuentes destacados.

### Casos a contemplar
- **Pago dividido** entre dos medios.
- **Descuento libre** (monto o %), sin permiso.
- **Pago anticipado:** cuando entra el dinero por adelantado se registra como **anticipo** (ingreso recibido). Al cerrar el servicio, ese anticipo se **imputa** al total del servicio. Si el o los anticipos cubren el **100%** del servicio, este se marca como **pagado** sin cobro adicional; si cubren solo una parte, se cobra el saldo restante por el flujo normal.
- **Cálculo de cambio:** aplica solo al método "efectivo"; el funnel debe poder identificar cuál de los métodos configurados es efectivo para activar el ingreso de monto recibido y el cambio.
- **Conectividad caída:** ver Sección 6 (cola local).

### Fuera del alcance del MVP
- **No se registra clienta:** el ERP no dispone de esa información.
- **Clienta que se va sin pagar / pendiente de cobro.**
- **Control y anulación/corrección de transacciones:** ya existe en el ERP y se sigue usando desde ahí.

---

## 5. Requisitos funcionales

1. Nueva experiencia de "carga rápida" dentro de la sección Transacciones del ERP.
2. Selección del tipo de transacción (Ingreso, Gasto, Costo, Movimiento) como primer paso.
3. UI compartida entre todos los tipos de transacción.
4. Para ingresos: selección de servicios y productos desde el catálogo por dropdown/botones, con destacados frecuentes; productos descuentan stock.
5. Para gastos/costos/movimientos: selección desde categorías **preconfiguradas** por dropdown, con campos de texto/monto donde aplique.
6. Cálculo automático del total desde precios del catálogo.
7. Opción rápida para editar el precio/monto a mano en cualquier transacción.
8. Descuento libre (monto o %), sin requerir permiso.
9. Registro opcional de propina en servicios ("No" por defecto).
10. Selección de medio de pago a partir de los **métodos de pago configurados en el ERP**, con soporte de pago dividido para ingresos.
11. Cálculo automático del cambio para efectivo.
12. Registro de **anticipos** (ingreso de dinero por adelantado) e imputación al servicio al cerrarlo; marca automática de "pagado" si los anticipos cubren el 100%.
13. Registro de la transacción en el ERP al cerrar, en tiempo real.
14. Cola local con reintento ante pérdida momentánea de conexión.

## 6. Requisitos no funcionales

- **Velocidad:** registro completo en ≤ 30 s; cada pantalla responde en < 300 ms.
- **Optimizado para laptop pequeña:** botones grandes, alto contraste, navegable con teclado/trackpad.
- **Reutilización:** no alterar el modelo de datos ni la lógica de caja existentes; solo agregar la capa de UX sobre la sección Transacciones.
- **Trazabilidad:** cada transacción registra quién, cuándo y qué.
- **Confiabilidad en el registro (cola local):** al eliminarse el cuaderno, ninguna transacción puede perderse. El funnel mantiene una **cola local** que retiene los registros ante un corte de conexión y los sincroniza automáticamente al recuperarla.

## 7. Métricas a instrumentar

- Tiempo promedio y número de toques por registro, por tipo de transacción.
- % de transacciones cargadas vía funnel vs. carga tradicional del ERP.
- % de registros de servicios/productos sin escritura libre (mide si el diseño cumple el objetivo).
- Frecuencia con que se edita el precio a mano (señal sobre si el catálogo está al día).
- Descuadre de caja diario.

## 8. Evolución posible (post-MVP)

- Integración de cobro con Mercado Pago.
- Registro de cliente asociado a la transacción, si el ERP incorpora esa información.
- Comisiones de peluqueras y reportes avanzados.