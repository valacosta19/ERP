import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Loader2 } from 'lucide-react'
import { useBusinessSnapshot } from '@/hooks/useBusinessSnapshot'
import { callGemini } from '@/lib/gemini'
import { buildSystemPrompt } from '@/lib/buildSystemPrompt'
import type { GeminiMessage } from '@/lib/gemini'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const WEB_SEARCH_REGEX = /busca en internet|busca en la web|busca online|buscá en internet|buscá en la web|buscá online|según internet/i

const SUGGESTED_QUESTIONS = [
  '¿Cuál fue mi mes más rentable en los últimos 6 meses?',
  '¿Qué servicios generan más ingresos?',
  '¿Conviene hacer un descuento este mes según las tendencias?',
  '¿Qué profesional generó más comisiones este trimestre?',
]

export function AIWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: snapshot, isLoading: snapshotLoading, error: snapshotError } = useBusinessSnapshot(isOpen)

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  function handleClose() {
    setIsOpen(false)
    setMessages([])
    setInputText('')
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading || !snapshot) return

    const userMsg: ChatMessage = { role: 'user', text: text.trim() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInputText('')
    setIsLoading(true)

    try {
      const systemPrompt = buildSystemPrompt(snapshot)
      const geminiHistory: GeminiMessage[] = updatedMessages.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }))

      const enableWebSearch = WEB_SEARCH_REGEX.test(text)
      const responseText = await callGemini({ systemPrompt, messages: geminiHistory, enableWebSearch })

      setMessages(prev => [...prev, { role: 'assistant', text: responseText }])
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error desconocido'
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${errMsg}` }])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputText)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity"
        aria-label="Asistente IA"
      >
        <Bot size={22} />
      </button>

      {isOpen && (
        <div
          className="fixed bottom-20 right-6 z-50 flex flex-col rounded-xl shadow-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
          style={{ width: 340, height: 500 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-[var(--color-accent)]" />
              <span className="text-sm font-semibold text-[var(--color-text)]">Asistente IA</span>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-xs text-[var(--color-muted)] text-center mb-1">
                  {snapshotLoading
                    ? 'Cargando datos del negocio…'
                    : snapshotError
                    ? `Error al cargar datos: ${snapshotError.message}`
                    : 'Preguntame sobre tu negocio'}
                </p>
                {SUGGESTED_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={snapshotLoading || !snapshot}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-3 py-2 rounded-lg text-xs whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'self-end bg-[var(--color-accent)] text-white'
                    : 'self-start bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-border)]'
                }`}
              >
                {msg.text}
              </div>
            ))}

            {isLoading && (
              <div className="self-start bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                <Loader2 size={14} className="animate-spin text-[var(--color-muted)]" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-[var(--color-border)]">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Escribí tu pregunta…"
                rows={1}
                disabled={isLoading || snapshotLoading || !snapshot}
                className="flex-1 resize-none text-xs px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50"
                style={{ maxHeight: 80 }}
              />
              <button
                onClick={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isLoading || snapshotLoading || !snapshot}
                className="p-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
