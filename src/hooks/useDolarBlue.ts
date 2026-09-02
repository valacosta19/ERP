import { useQuery } from '@tanstack/react-query'

export interface DolarBlue {
  venta: number
  fechaActualizacion: string
}

export function useDolarBlue() {
  return useQuery<DolarBlue>({
    queryKey: ['dolar-blue'],
    queryFn: async () => {
      const res = await fetch('https://dolarapi.com/v1/dolares/blue')
      if (!res.ok) throw new Error('No se pudo obtener el dólar blue')
      return res.json()
    },
    staleTime: 1000 * 60 * 30,
  })
}
