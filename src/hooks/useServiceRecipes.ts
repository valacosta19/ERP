import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import type { ServiceRecipe } from '@/types'

export function useServiceRecipes(catalogItemId: string | null) {
  return useQuery({
    queryKey: ['service-recipes', catalogItemId],
    enabled: catalogItemId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_recipes')
        .select('*')
        .eq('catalog_item_id', catalogItemId!)
      if (error) throw new Error(error.message)
      return data as ServiceRecipe[]
    },
  })
}

export function useUpsertServiceRecipes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      catalogItemId,
      recipes,
    }: {
      catalogItemId: string
      recipes: { product_id: string; quantity_grams: number }[]
    }) => {
      const { error: deleteError } = await supabase
        .from('service_recipes')
        .delete()
        .eq('catalog_item_id', catalogItemId)
      if (deleteError) throw new Error(deleteError.message)

      if (recipes.length === 0) return

      const rows = recipes.map((r) => ({
        catalog_item_id: catalogItemId,
        product_id: r.product_id,
        quantity_grams: r.quantity_grams,
      }))

      const { error: insertError } = await supabase.from('service_recipes').insert(rows)
      if (insertError) throw new Error(insertError.message)
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['service-recipes', variables.catalogItemId] })
      qc.invalidateQueries({ queryKey: ['service-recipes-all'] })
    },
  })
}
