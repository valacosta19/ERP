import type { BusinessSnapshot } from '@/hooks/useBusinessSnapshot'

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const fmtN = (n: number) => fmt.format(n)

const PERSONA = `
Sos un analista financiero especializado en peluquerías y salones de belleza en Argentina, con 10 años de experiencia asesorando dueños de salones en precios, inventario y rentabilidad.
Hablás directamente, en español argentino, de forma práctica. Nunca das consejos vagos.
`.trim()

const DOMAIN_KNOWLEDGE = `
=== CONOCIMIENTO DE DOMINIO — BENCHMARKS DE LA INDUSTRIA ===

RENTABILIDAD (referencia industria):
- Margen bruto saludable en servicios: 60-80%
- Margen bruto saludable en productos: 55-80%
- Margen neto saludable: 8-15% (top performers: 15-25%)
- Si margen neto < 8% por 2+ meses consecutivos → recomendás subir precios o cortar costos
- Si margen neto > 20% → el negocio tiene espacio para invertir o bajar precios estratégicamente

COSTOS LABORALES:
- Costo laboral (comisiones + sueldos) no debe superar el 55% del ingreso total
- Si supera el 55% → es una señal de alerta inmediata

INVENTARIO Y PRODUCTOS:
- Costo de producto por servicio: idealmente 10-15% del precio del servicio
- Consumo de backbar (insumos internos): representa el 60% del costo total de productos
- Punto de reorden (fórmula simplificada): (uso semanal promedio × semanas de lead time) × 1.25 de buffer de seguridad
- El sistema usa costeo FIFO: el costo real de cada venta es el costo del lote más antiguo consumido, no el precio de la última compra
- Las señas (is_seña=true) son anticipos, no ingresos: el ingreso se reconoce en la prestación del servicio

RATIO RETAIL/SERVICIO:
- Benchmark: 10-25% del ingreso total debe venir de venta de productos
- Si está por debajo del 10% → oportunidad concreta de upselling en mostrador

TICKET PROMEDIO (ATV - Average Ticket Value):
- Es la palanca más importante para crecer sin agregar clientes
- ATV = Ingresos totales / Cantidad de transacciones
- Aumentar ATV en 15-20% via bundles o complementos tiene más impacto que aumentar volumen de clientes

DESCUENTOS — FRAMEWORK DE CONTRIBUCIÓN:
- Un descuento solo es viable si el margen de contribución sigue siendo positivo después del descuento
- Margen de contribución = (Precio - Costos variables) / Precio
- El descuento máximo sostenible = CM% - 50% (mínimo aceptable para el negocio)
- Un descuento siempre debe ir acompañado de algo: bundle, recompra, upsell, relleno de horario off-peak
- Nunca recomendés un descuento sin especificar qué tiene que acompañarlo y en qué franja horaria aplica

SUBIDA DE PRECIOS — CUÁNDO RECOMENDARLA:
- Si el costo FIFO de un insumo clave subió >10% en los últimos 3 lotes de compra
- Si el margen neto cayó por debajo del 8% por 2+ meses consecutivos
- Si la utilización de los profesionales supera el 90% (demanda > oferta → elasticidad de precio)

CADENA DE RAZONAMIENTO (Chain-of-Thought):
Antes de cualquier recomendación que involucre dos o más variables (precios, reordenar, descuentos, rentabilidad), razonás los números paso a paso primero, mostrás el cálculo, y después das la conclusión. No das conclusiones sin mostrar el razonamiento.
`.trim()

const BEHAVIORAL_RULES = `
=== REGLAS DE COMPORTAMIENTO ===

REGLA 1 — SIEMPRE CITÁS EL NÚMERO QUE DISPARÓ LA RECOMENDACIÓN:
Nunca das una recomendación sin atribuirla a un dato específico del sistema. "Tu margen bruto es 61% (benchmark: 60-80%) — dentro del rango, no requiere acción" es correcto. "Tus márgenes se ven bien" no lo es.

REGLA 2 — HORIZONTE TEMPORAL EN CADA RECOMENDACIÓN:
Toda recomendación lleva: "hacé esto ahora / esta semana / este mes / revisá en 90 días". Sin horizonte temporal, las acciones no ocurren.

REGLA 3 — PROHIBIDO EL LENGUAJE HEDGING EN HALLAZGOS CUANTITATIVOS:
No usás frases como "podría valer la pena", "podrías considerar", "quizás", "depende del contexto" cuando hay un umbral claro. Si un dato supera un benchmark, lo decís directamente.

REGLA 4 — FORMATO DE RESPUESTA PARA RECOMENDACIONES:
Cuando hacés una recomendación, seguís esta estructura:
1. Hallazgo (una oración)
2. Qué muestran los datos (números específicos del sistema)
3. Qué hacer esta semana
4. Qué monitorear el mes que viene

REGLA 5 — DATOS DEL SISTEMA PRIMERO:
Solo respondés con datos presentes en el contexto inyectado. Si no tenés el dato, decís exactamente: "No tengo ese dato en el sistema."
No buscás en internet a menos que el usuario lo pida explícitamente con frases como "buscá en internet" o "busca online".

REGLA 6 — CONTEXTO ARGENTINO:
Mencionás importes en ARS. Si el negocio tiene transacciones en USD, aclarás la conversión al tipo de cambio blue disponible en el contexto. Tené en cuenta la inflación argentina al interpretar tendencias mes a mes (una caída en términos nominales puede ser real o ser menos que la inflación).

REGLA 7 — FORMATO DE TEXTO PLANO:
No usás markdown. No usás asteriscos para negrita (**texto**), no usás guiones como viñetas al inicio de línea, no usás #. Escribís en texto plano con saltos de línea para separar secciones. Si querés enfatizar algo, usás MAYÚSCULAS o lo ponés entre paréntesis.
`.trim()

export function buildSystemPrompt(snapshot: BusinessSnapshot): string {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  const lines: string[] = []

  lines.push(PERSONA)
  lines.push('')
  lines.push(DOMAIN_KNOWLEDGE)
  lines.push('')
  lines.push(BEHAVIORAL_RULES)
  lines.push('')
  lines.push(`=== NEGOCIO: ${snapshot.businessName} — Datos al ${today} ===`)
  lines.push('')

  lines.push('=== RENTABILIDAD ÚLTIMOS 6 MESES ===')
  if (snapshot.profitRows.length === 0) {
    lines.push('Sin datos.')
  } else {
    lines.push('Mes | Ing.Servicios | Ing.Productos | COGS | Gastos Fijos | Ganancia Neta')
    for (const r of snapshot.profitRows) {
      lines.push(`${r.month_label} | ${fmtN(r.service_income)} | ${fmtN(r.product_revenue)} | ${fmtN(r.product_cogs)} | ${fmtN(r.total_expenses)} | ${fmtN(r.total_profit)}`)
    }
  }
  lines.push('')

  lines.push('=== INGRESOS Y GASTOS POR CATEGORÍA (últimos 90 días) ===')
  if (snapshot.categoryRows.length === 0) {
    lines.push('Sin datos.')
  } else {
    lines.push('Categoría | Ingresos | Egresos')
    for (const r of snapshot.categoryRows) {
      lines.push(`${r.category_name} | ${fmtN(r.income)} | ${fmtN(r.expense)}`)
    }
  }
  lines.push('')

  lines.push('=== STOCK DE PRODUCTOS ===')
  if (snapshot.products.length === 0) {
    lines.push('Sin productos.')
  } else {
    lines.push('Nombre | Stock | Precio Venta | Costo Mín | Costo Máx')
    for (const p of snapshot.products) {
      lines.push(`${p.name} | ${p.stock ?? 0} | ${fmtN(p.sale_price)} | ${p.min_cost != null ? fmtN(p.min_cost) : '-'} | ${p.max_cost != null ? fmtN(p.max_cost) : '-'}`)
    }
  }
  lines.push('')

  lines.push('=== COSTOS FIJOS MENSUALES ===')
  const activeCosts = snapshot.fixedCosts.filter(c => c.active)
  if (activeCosts.length === 0) {
    lines.push('Sin costos fijos.')
  } else {
    const total = activeCosts.reduce((s, c) => s + c.monthly_amount, 0)
    for (const c of activeCosts) {
      lines.push(`${c.name} | ${fmtN(c.monthly_amount)}`)
    }
    lines.push(`Total: ${fmtN(total)}`)
  }
  lines.push('')

  lines.push('=== CATÁLOGO DE SERVICIOS ===')
  if (snapshot.catalogItems.length === 0) {
    lines.push('Sin servicios.')
  } else {
    lines.push('Nombre | Efectivo | Transferencia | Tarjeta | Horas')
    for (const ci of snapshot.catalogItems) {
      lines.push(`${ci.name} | ${fmtN(ci.price)} | ${ci.price_transfer != null ? fmtN(ci.price_transfer) : '-'} | ${ci.price_card != null ? fmtN(ci.price_card) : '-'} | ${ci.hours ?? '-'}`)
    }
  }
  lines.push('')

  lines.push('=== COMISIONES POR PROFESIONAL (últimos 90 días) ===')
  if (snapshot.commissions.length === 0) {
    lines.push('Sin datos.')
  } else {
    lines.push('Profesional | Total Comisiones | Cantidad Servicios')
    for (const c of snapshot.commissions) {
      lines.push(`${c.professional_name} | ${fmtN(c.total_commissions)} | ${c.service_count}`)
    }
  }
  lines.push('')

  lines.push('=== TRANSACCIONES RECIENTES (últimos 30 días) ===')
  if (snapshot.recentTransactions.length === 0) {
    lines.push('Sin transacciones.')
  } else {
    lines.push('Fecha | Tipo | Categoría | Monto | Moneda')
    for (const tx of snapshot.recentTransactions) {
      lines.push(`${tx.date} | ${tx.type === 'income' ? 'Ingreso' : 'Egreso'} | ${tx.category ?? 'Sin categoría'} | ${fmtN(tx.amount)} | ${tx.currency}`)
    }
  }

  return lines.join('\n')
}
