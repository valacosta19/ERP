// API key: set VITE_GEMINI_API_KEY in your .env file (do not commit it)

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

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
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY no está configurada')

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: { temperature: 0.3 },
  }

  if (enableWebSearch) {
    body.tools = [{ googleSearch: {} }]
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errText}`)
  }

  const json = await res.json()

  if (json.error) throw new Error(`Gemini error: ${json.error.message}`)

  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini no devolvió contenido')

  return text
}
