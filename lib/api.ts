"use server"

type Message = {
  role: "system" | "user" | "assistant"
  content: string
}

type ApiResponse = {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Ordered fallback chain of OpenRouter's free-tier models, ordered by real
// measured latency/reliability (benchmarked directly against the API, not
// guessed from model names — "lightning" and "nano" turned out to be
// slow/unreliable in practice, while "ultra"/"super" were fast).
// callOpenRouterApi tries them in order and moves to the next one whenever a
// model errors, times out, is rate-limited, or gets deleted/renamed on
// OpenRouter's end, so the app keeps responding instead of going down with a
// single provider. "openrouter/free" is kept last as a catch-all auto-router
// across whatever free models are currently live, in case every named slug
// above breaks.
//
// Excluded entirely: thinkingmachines/inkling and inkling-small — they
// return 403 "only available on agentic harnesses" on a plain chat
// completions call, so they can never succeed here.
const FALLBACK_MODELS = [
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "dots-studio/dots-3-note-preview:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "poolside/laguna-xs-2.1:free",
  "liquid/lfm-2.5-2.6b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3.5-lightning:free",
  "minimax/minimax-m2.7:free",
  "minimax/minimax-m3:free",
  "openrouter/free",
] as const

// Per-attempt request timeout. Free models occasionally hang instead of
// erroring quickly — without a cap, one stuck model could block the whole
// fallback chain for a long time. Aborting early keeps things fast.
const MODEL_TIMEOUT_MS = 8_000

async function callModel(model: string, messages: Message[], maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable")
  }

  const controller = new AbortController()
  // Covers the whole attempt (connect + stream to completion), not just the
  // initial fetch — a model that stalls mid-stream gets aborted too.
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://intellistudy.app",
          "X-Title": "IntelliStudy",
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: maxTokens,
          // Keep hidden "thinking" short/off — most of the latency on free
          // reasoning models comes from thinking tokens generated before the
          // visible answer, not from the answer itself.
          reasoning: { effort: "low", exclude: true },
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Model "${model}" timed out after ${MODEL_TIMEOUT_MS}ms`)
      }
      throw error
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      throw new Error(`Model "${model}" failed with status ${response.status}: ${errorText}`)
    }

    // Handle streaming response
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let done = false
      let buffer = ""
      let result = ""

      try {
        while (!done) {
          const { value, done: doneReading } = await reader.read()
          done = doneReading
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
          const lines = buffer.split("\n")
          buffer = lines.pop()!

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") {
              done = true
              break
            }

            let json: any
            try {
              json = JSON.parse(data)
            } catch {
              continue // partial chunk, wait for more data
            }

            if (json.error) {
              throw new Error(json.error.message || `Model "${model}" returned a streaming error`)
            }

            const delta = json.choices?.[0]?.delta
            if (delta?.content) {
              result += delta.content
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`Model "${model}" timed out after ${MODEL_TIMEOUT_MS}ms`)
        }
        throw error
      }

      if (!result.trim()) {
        throw new Error(`Model "${model}" returned an empty response`)
      }
      return result
    }

    // Fallback to normal JSON response
    const data: ApiResponse = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error(`Model "${model}" returned no content`)
    }
    return content
  } finally {
    clearTimeout(timeout)
  }
}

export async function callOpenRouterApi(messages: Message[], maxTokens = 700): Promise<string> {
  let lastError: unknown = null

  for (const model of FALLBACK_MODELS) {
    try {
      return await callModel(model, messages, maxTokens)
    } catch (error) {
      console.error(`[OpenRouter] "${model}" failed, falling back to next model:`, error)
      lastError = error
    }
  }

  console.error("[OpenRouter] All fallback models failed:", lastError)
  throw new Error(
    `All AI models are currently unavailable. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

export async function summarizeText(text: string): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are an AI assistant that specializes in summarizing text. Provide concise, accurate summaries that capture the main points of the given text.",
    },
    {
      role: "user",
      content: `Please summarize the following text:\n\n${text}`,
    },
  ]

  return callOpenRouterApi(messages, 800)
}

export async function rewriteContent(text: string, style: string): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are an AI assistant that specializes in rewriting and paraphrasing text. Maintain the original meaning while improving clarity and style.",
    },
    {
      role: "user",
      content: `Please rewrite the following text in a ${style} style:\n\n${text}`,
    },
  ]

  return callOpenRouterApi(messages, 800)
}

export async function generateQuiz(topic: string, difficulty: string, questionCount: number): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are an AI assistant that specializes in creating educational quizzes. Generate well-structured quizzes in JSON format that can be used in interactive applications."
    },
    {
      role: "user",
      content: `Please create a ${difficulty} quiz about ${topic} with ${questionCount} questions.

Format your response as a strict JSON object with the following structure:
{
  "title": "Quiz title related to the topic",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "id": 1,
      "question": "The question text",
      "options": [
        {"id": "A", "text": "First option"},
        {"id": "B", "text": "Second option"},
        {"id": "C", "text": "Third option"},
        {"id": "D", "text": "Fourth option"}
      ],
      "correctAnswer": "B",
      "explanation": "Brief explanation why this is the correct answer"
    }
  ]
}

Make the quiz educational and appropriate for the ${difficulty} difficulty level. Include clear explanations for the correct answers. Return ONLY the valid JSON with no additional text, markdown formatting, or code blocks.`
    }
  ]

  // Quizzes need more room the more questions are requested, or the JSON gets truncated.
  const maxTokens = Math.min(4000, 400 + questionCount * 200)
  return callOpenRouterApi(messages, maxTokens)
}

export async function chatWithAI(userMessage: string, chatHistory: Message[] = []): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content: "You are IntelliBot, a helpful AI assistant for students. Respond quickly and concisely, prioritizing clarity.\n\nFormatting Guidelines:\n- Avoid using LaTeX syntax, including backslashes (\\), dollar signs ($), and environments like \\begin{align*}...\\end{align*}.\n- Do not use decorative symbols such as:\n  - Triple hashes (###)\n  - Asterisks (****)\n  - Backticks (```) \n  - Tildes (~~~)\n  - Angle brackets (<> or <<>>)\n  - Curly braces ({})\n  - Vertical bars (|)\n  - Square brackets ([])\n  - Underscores (_)\n  - Equal signs (===)\n  - Dashes (---)\n  - Arrows (e.g., ->, <-, =>)\n- Present information using clear, human-friendly formatting:\n  - Use plain text for mathematical expressions.\n  - Organize content with headings and bullet points.\n  - Separate sections with simple line breaks.\n- Ensure all responses are easy to read and understand, avoiding unexplained symbols or complex formatting.\n- Whenever you introduce yourself or mention your name, always format 'IntelliBot' in bold using double asterisks (e.g., **IntelliBot**).\n\nWhen you see mathematical expressions in LaTeX (such as align* environments or within \\[ ... \\]), convert them to plain text or easy-to-read lists. Replace decorative symbols with clear, human-friendly formatting such as headings, bullet points, or separators. Never output raw LaTeX or unexplained symbols. Always make your answers easy to read and understand."
    },
    ...chatHistory,
    {
      role: "user",
      content: userMessage
    }
  ];

  return callOpenRouterApi(messages, 600);
}
