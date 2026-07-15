import { buildMarketContextSummary } from '@/app/lib/marketContext'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) {
    return Response.json(
      { error: 'Advisor not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables (Settings → Environment Variables).' },
      { status: 503 }
    )
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { message, history = [], familySnapshot = {} } = body
  if (!message?.trim()) {
    return Response.json({ error: 'Message is required.' }, { status: 400 })
  }

  const marketContext = buildMarketContextSummary()

  const systemPrompt = `You are Artha, a private family wealth advisor for an Indian family. You have full access to the family's financial data and an Indian market context snapshot as of July 2026.

${marketContext}

FAMILY FINANCIAL SNAPSHOT (computed from live family data):
${JSON.stringify(familySnapshot, null, 2)}

YOUR ROLE:
- Analyse the family's specific situation using only the data above
- Contextualise findings against the current Indian market environment
- Be concise, warm, and actionable — 2–4 short paragraphs maximum
- Every rupee figure, percentage, or count you cite MUST come from the family snapshot above — never invent or hallucinate numbers
- If a data point is missing or zero, acknowledge it rather than guessing
- Tie every recommendation to the family's actual numbers, not generic advice
- Do not use markdown headers — plain prose only
- End with one concrete next action the family can take this week

DISCLAIMER (include naturally when relevant, never robotically): You are not a SEBI-registered financial advisor. Recommend consulting a qualified advisor before major decisions.`

  // Keep last 6 turns (3 exchanges) for context
  const messages = [
    ...(history || []).slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message.trim() },
  ]

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[advisor] Anthropic API error:', res.status, errText)
      return Response.json(
        { error: 'Advisor temporarily unavailable. Please try again in a moment.' },
        { status: 502 }
      )
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text ?? ''
    return Response.json({ reply })
  } catch (e) {
    console.error('[advisor] fetch failed:', e.message)
    return Response.json(
      { error: 'Network error reaching the advisor. Please try again.' },
      { status: 502 }
    )
  }
}
