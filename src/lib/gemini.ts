import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export interface GeminiMessage {
  role: 'user' | 'model'
  parts: { text: string }[]
}

interface CallGeminiOptions {
  systemPrompt: string
  messages: GeminiMessage[]
  enableWebSearch: boolean
}

export async function callGemini({ systemPrompt, messages, enableWebSearch }: CallGeminiOptions): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text?: string }>('ask-gemini', {
    body: { systemPrompt, messages, enableWebSearch },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? `ask-gemini error ${error.context.status}`)
    }
    throw new Error(error.message)
  }

  if (!data?.text) throw new Error('Gemini no devolvió contenido')

  return data.text
}
