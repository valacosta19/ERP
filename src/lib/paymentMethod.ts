export function findCashPaymentMethod(methods: string[]): string | null {
  return methods.find(method => method.trim().toLocaleLowerCase('es') === 'efectivo') ?? null
}
