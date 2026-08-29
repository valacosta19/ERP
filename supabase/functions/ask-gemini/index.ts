import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY no está configurada en el servidor' }, 500)
  }

  const { systemPrompt, messages, enableWebSearch } = await req.json()
  if (typeof systemPrompt !== 'string' || !Array.isArray(messages)) {
    return jsonResponse({ error: 'Payload inválido' }, 400)
  }

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: { temperature: 0.3 },
  }
  if (enableWebSearch) {
    body.tools = [{ googleSearch: {} }]
  }

  const res = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    return jsonResponse({ error: `Gemini API error ${res.status}: ${errText}` }, res.status)
  }

  const json = await res.json()
  if (json.error) {
    return jsonResponse({ error: `Gemini error: ${json.error.message}` }, 502)
  }

  const text: string | undefined = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    return jsonResponse({ error: 'Gemini no devolvió contenido' }, 502)
  }

  return jsonResponse({ text })
})
