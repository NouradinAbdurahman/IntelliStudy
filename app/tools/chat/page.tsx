"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { MessageSquare, Send, Loader2, User, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import Navbar from "@/components/navbar"
import { chatWithAI } from "@/lib/api"
import { cn } from "@/lib/utils"
import Image from "next/image"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Custom CSS for the blinking cursor
const cursorStyle = `
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  .blinking-cursor {
    animation: blink 1s step-end infinite;
    font-weight: bold;
    color: currentColor;
  }
`;

// Function to format message text and convert ** to bold elements
const formatMessage = (text: string) => {
  // Regular expression to find text between asterisks
  const parts = text.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // Extract the text without asterisks and wrap in a bold element
      const boldText = part.slice(2, -2);
      return <strong key={index}>{boldText}</strong>;
    }
    return part;
  });
};

type Message = {
  role: "system" | "user" | "assistant"
  content: string
}

// Helper to auto-wrap code blocks in markdown with language identifiers
function autoFormatCodeBlocks(text: string): string {
  if (text.includes('```')) return text; // Already formatted
  const codeBlockRegex = /((?:^|\n)(?:\s{0,4}(?:#|def |class |import |print\(|for |while |if |else:|elif |try:|except |input\()).+\n(?:[ \t]*.+\n)*?)/g;
  return text.replace(codeBlockRegex, (match) => {
    if (match.trim().startsWith('```')) return match;
    return `\n\n\`\`\`python\n${match.trim()}\n\`\`\`\n`;
  });
}

// Helper to split code and explanation for assistant messages
function splitCodeAndExplanation(text: string) {
  // If already contains a code block, split on it
  const codeBlockPattern = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let result = [];
  let match;
  let found = false;
  while ((match = codeBlockPattern.exec(text)) !== null) {
    found = true;
    // Explanation before code
    if (match.index > lastIndex) {
      const explanation = text.slice(lastIndex, match.index).trim();
      if (explanation) result.push({ type: 'explanation', content: explanation });
    }
    // Check if 'Explanation:' is inside the code block
    const codeContent = match[2];
    const explanationIndex = codeContent.indexOf('Explanation:');
    if (explanationIndex !== -1) {
      // Split code and explanation
      const codePart = codeContent.slice(0, explanationIndex).trim();
      const explanationPart = codeContent.slice(explanationIndex).trim();
      if (codePart) result.push({ type: 'code', lang: match[1] || 'plaintext', content: codePart });
      if (explanationPart) result.push({ type: 'explanation', content: explanationPart });
    } else {
      // Code block
      result.push({ type: 'code', lang: match[1] || 'plaintext', content: codeContent.trim() });
    }
    lastIndex = codeBlockPattern.lastIndex;
  }
  // Any trailing explanation
  if (lastIndex < text.length) {
    const explanation = text.slice(lastIndex).trim();
    if (explanation) result.push({ type: 'explanation', content: explanation });
  }
  // If no code block found, treat all as explanation
  if (!found) return [{ type: 'explanation', content: text }];
  return result;
}

export default function ChatPage() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [partialResponse, setPartialResponse] = useState("")
  const [awaitingNouradinInfo, setAwaitingNouradinInfo] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Ref to store the current pause function for the typing session
  const pauseResponseRef = useRef<() => void>(() => {})

  // Modified scroll function to handle scrolling better
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight } = chatContainerRef.current
      chatContainerRef.current.scrollTop = scrollHeight - clientHeight
    }
  }

  // Function to pause/stop response generation
  const pauseResponse = () => {
    setIsTyping(false)
    if (partialResponse) {
      // Add the partial response as the assistant's message
      setMessages((prev) => [...prev, { role: "assistant", content: partialResponse }])
      setPartialResponse("")
    }
  }

  // Scroll when messages or partialResponse change
  useEffect(() => {
    // Use a small timeout to ensure content has rendered
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);  // Increased timeout for better rendering
    return () => clearTimeout(timer);
  }, [messages, partialResponse]);

  // Add an additional effect to handle scrolling during typing
  useEffect(() => {
    if (partialResponse) {
      const timer = setInterval(() => {
        scrollToBottom();
      }, 500); // Check every 500ms if scroll is needed during typing
      return () => clearInterval(timer);
    }
  }, [partialResponse]);

  // Typing animation for welcome message
  const welcomeDescription = "I'm your AI study assistant. Ask me anything about your studies, homework, or academic concepts, and I'll do my best to help you succeed!"
  const [typedWelcome, setTypedWelcome] = useState("")
  useEffect(() => {
    if (messages.length === 0) {
      setTypedWelcome("");
      let i = 0;
      let cancelled = false;
      let current = "";
      const interval = setInterval(() => {
        if (cancelled) return;
        if (i < welcomeDescription.length) {
          current += welcomeDescription.charAt(i);
          setTypedWelcome(current);
          i++;
        } else {
          clearInterval(interval);
        }
      }, 18);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
  }, [messages.length]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()

    if (!input.trim()) return

    // Custom Nouradin info response logic
    const nameRegex = /nour(a|e)?l?d{1,2}i?n|nuur(a|e)?l?d{1,2}i?n/gi;
    const yesRegex = /^(yes|yeah|yep|yup|sure|of course|ok|okay|please|tell me more|more info|who is he|who's he|who is the creator|who's the creator|who made this|who built this|who developed this)/i;

    if (awaitingNouradinInfo && yesRegex.test(input.trim())) {
      // Show full info with typewriter effect
      const fullInfo = `Nouraddin Abdurahman Aden is a Software Engineering Student, Data Engineer, and Frontend Developer (Next.js, React, TailwindCSS).\n\nHe's skilled in Python, SQL, AWS, ETL, Machine Learning, Data Mining, and Software Project Management.\nHe's certified as a Data Analyst in SQL, Data Scientist in Python, and Associate Data Engineer in SQL.\n\nEducation:\n- OSTIM Teknik Üniversitesi (Software Engineering, 2021–2026)\n- Omar bin Abdul Aziz Secondary (IT/Engineering, 2018–2021)\n- Religious Institute Preparatory Secondary (Islamic Studies, 2014–2018)\n\nNouraddin is passionate about building scalable, data-driven systems and modern web apps. He's experienced in designing data pipelines, working with SQL databases, leveraging Python for data transformation, and developing with Next.js, React, and TailwindCSS. He's also learning cloud platforms like AWS and exploring ETL frameworks and data warehouses.\n\nContact:\n* Email: [n.aden1208@gmail.com](mailto:n.aden1208@gmail.com)\n* LinkedIn: [linkedin.com/in/nouraddin](https://linkedin.com/in/nouraddin)\n* GitHub: [@NouradinAbdurahman](https://github.com/NouradinAbdurahman)\n* Instagram: [@nouradiin_](https://www.instagram.com/nouradiin_/)\n* X (Twitter): [@Nouradin1208](https://x.com/Nouradin1208)`;
      setMessages(prev => [...prev, { role: "user", content: input }])
      setInput("")
      setIsLoading(true)
      setPartialResponse("")
      setAwaitingNouradinInfo(false)
      // Animate the response
      let i = 0
      const step = 20
      setIsTyping(true)
      function typeNextChar() {
        if (i < fullInfo.length) {
          setPartialResponse(fullInfo.slice(0, i + step))
          i += step
          setTimeout(typeNextChar, 3)
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: fullInfo }])
          setPartialResponse("")
          setIsTyping(false)
        }
      }
      typeNextChar()
      setIsLoading(false)
      return;
    }

    if (nameRegex.test(input.trim())) {
      // Short app-focused message with typewriter effect
      const shortInfo = `Nouraddin is the creator of **IntelliStudy**, combining backend data skills and frontend expertise to deliver a modern, interactive AI-powered study assistant.\n\nDo you want to know more about the creator of **IntelliStudy**?`;
      setMessages(prev => [...prev, { role: "user", content: input }])
      setInput("")
      setIsLoading(true)
      setPartialResponse("")
      setAwaitingNouradinInfo(true)
      // Animate the response
      let i = 0
      const step = 20
      setIsTyping(true)
      function typeNextChar() {
        if (i < shortInfo.length) {
          setPartialResponse(shortInfo.slice(0, i + step))
          i += step
          setTimeout(typeNextChar, 3)
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: shortInfo }])
          setPartialResponse("")
          setIsTyping(false)
        }
      }
      typeNextChar()
      setIsLoading(false)
      return;
    }

    const userMessage: Message = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    setPartialResponse("")

    try {
      const chatHistory = messages.filter((m) => m.role !== "system")
      const response = await chatWithAI(input, chatHistory)

      // Set typing state to true to show the pause button
      setIsTyping(true)
      
      // Use a reference to track if typing should continue
      let shouldContinueTyping = true
      
      // Create a local pauseResponse function for this typing session
      const pauseForThisSession = () => {
        shouldContinueTyping = false
        setIsTyping(false)
        if (partialResponse) {
          setMessages((prev) => [...prev, { role: "assistant", content: partialResponse }])
          setPartialResponse("")
        }
      }
      
      // Store the original function reference
      // const originalPauseFunction = pauseResponse // (no longer needed)
      
      // Create a new function that we'll use during this typing session
      // let currentPauseFunction = pauseForThisSession // (no longer needed)

      let i = 0
      const step = 20; // Number of characters to reveal per tick
      function typeNextChar() {
        if (i < response.length) {
          const currentPartialText = response.slice(0, i + step)
          setPartialResponse(currentPartialText)
          i += step
          // Much faster typing for code blocks and math expressions
          const delay = response.slice(i-3, i).includes('\\') || response[i] === '`' ? 1 : 3
          // Only continue if we haven't been paused
          if (shouldContinueTyping) {
            setTimeout(typeNextChar, delay)
          }
        } else {
          // Finished typing
          setMessages((prev) => [...prev, { role: "assistant", content: response }])
          setPartialResponse("")
          setIsTyping(false)
        }
      }

      // Override the pauseResponse function for this session
      // @ts-ignore - Temporarily override the function
      // pauseResponse = pauseForThisSession
      pauseResponseRef.current = pauseForThisSession
      
      // Start the typing animation
      typeNextChar()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      })
      console.error(error)
      setPartialResponse("")
      setIsTyping(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Helper to get plain text from formatted JSX (for copy)
  function getPlainTextFromFormattedMessage(text: string) {
    // Remove **bold** markers and return plain text
    return text.replace(/\*\*(.*?)\*\*/g, '$1')
  }

  const handleCopy = (text: string, index: number) => {
    const plain = getPlainTextFromFormattedMessage(text)
    navigator.clipboard.writeText(plain)
    setCopiedIndex(index)
    toast({
      title: "Copied!",
      description: "AI response copied to clipboard.",
      duration: 1200,
    })
    setTimeout(() => setCopiedIndex(null), 1000)
  }

  // Handle Enter/Shift+Enter for textarea
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Only send if not loading and input is not empty
      if (!isLoading && input.trim()) {
        // Simulate form submit
        const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
        handleSendMessage(fakeEvent);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <style jsx global>{cursorStyle}</style>

      {/* Main container with fixed height */}
      <div className="flex-1 flex flex-col w-full max-w-full sm:container sm:max-w-screen-xl mx-auto px-1 xs:px-2 sm:px-4 pt-2 pb-2 overflow-hidden">
        <div className="text-center mb-2 sm:mb-3">
          <div className="inline-flex rounded-full bg-primary/10 p-1 sm:p-2 mb-1 sm:mb-2">
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <h1 className="text-base xs:text-lg sm:text-xl lg:text-2xl font-bold gradient-text">AI Chatbot</h1>
          <p className="text-xs xs:text-sm text-muted-foreground mt-1 max-w-full xs:max-w-xs sm:max-w-lg lg:max-w-2xl mx-auto px-2">
            Get instant answers to your questions and receive personalized learning assistance.
          </p>
        </div>

        {/* Chat container - fixed 100vh height minus header/title space */}
        <Card className="flex-1 flex flex-col w-full max-w-full sm:max-w-4xl mx-auto gradient-border overflow-hidden" 
          style={{ height: 'calc(100vh - 130px)', maxHeight: 'calc(100vh - 100px)' }}>
          <CardHeader className="px-2 py-1 xs:py-2 sm:px-4 md:px-6 sm:py-2 md:py-3 shrink-0">
            <CardTitle className="text-sm xs:text-base sm:text-lg">Chat with <span className="gradient-text">IntelliBot</span></CardTitle>
            <CardDescription className="text-xs">Your AI study assistant is ready to help with your questions</CardDescription>
          </CardHeader>
          
          {/* Scrollable message area - only this should scroll */}
          <CardContent 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto px-2 xs:px-3 sm:px-4 md:px-6 py-2 xs:py-3 sm:py-3 border-t"
          >
            <div className="flex flex-col w-full h-full">
              {messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center w-full h-full text-center p-4">
                  <div className="flex flex-col items-center justify-center w-full">
                    <div className="h-12 w-12 relative mb-4">
                      <Image 
                        src="https://i.ibb.co/v49kzqvJ/Logo.png" 
                        alt="IntelliBot Logo" 
                        fill
                        className="object-contain"
                      />
                    </div>
                    <h3 className="text-sm sm:text-lg font-semibold mb-2">Hi, I'm <span className="gradient-text">IntelliBot</span></h3>
                    <p className="text-xs sm:text-sm text-muted-foreground max-w-[90vw] sm:max-w-md min-h-[40px]">
                      {typedWelcome}
                      {typedWelcome.length < welcomeDescription.length && <span className="blinking-cursor">|</span>}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full flex-1 space-y-2 xs:space-y-3 sm:space-y-4 pb-2 sm:pb-4 flex flex-col">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex items-start gap-1 xs:gap-2 rounded-lg p-2 xs:p-3",
                        message.role === "user"
                          ? "self-end bg-primary/20 max-w-[85vw] xs:max-w-[80vw] sm:max-w-fit"
                          : "self-start bg-secondary/60 max-w-[85vw] xs:max-w-[90vw] sm:max-w-[80%] md:max-w-[75%]"
                      )}
                    >
                      {message.role === "user" ? (
                        <div className="rounded-full p-1 flex-shrink-0 bg-background">
                          <User className="h-3 w-3 xs:h-3.5 xs:w-3.5 sm:h-4 sm:w-4" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 relative flex-shrink-0">
                          <Image 
                            src="/Logo.png" 
                            alt="IntelliBot Logo" 
                            fill
                            className="object-contain"
                          />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap text-xs xs:text-sm flex-1 break-words pr-1 w-full">
                        {message.role === "assistant" ? (
                          splitCodeAndExplanation(autoFormatCodeBlocks(message.content)).map((block, i) =>
                            block.type === 'code' ? (
                              <div key={i} className="my-1 xs:my-2 relative group w-full">
                                <button
                                  className="absolute top-1 xs:top-2 right-1 xs:right-2 z-10 bg-muted px-1 xs:px-2 py-0.5 xs:py-1 rounded text-xs opacity-80 hover:opacity-100 transition"
                                  onClick={() => navigator.clipboard.writeText(block.content)}
                                  title="Copy code"
                                  type="button"
                                >
                                  Copy
                                </button>
                                <div className="w-full">
                                  <SyntaxHighlighter
                                    language={block.lang}
                                    style={oneDark}
                                    customStyle={{ 
                                      borderRadius: '6px', 
                                      padding: '0.75em 1em', 
                                      fontSize: '0.75em',
                                      margin: 0, 
                                      width: '100%'
                                    }}
                                    showLineNumbers={false}
                                    wrapLongLines={true}
                                  >
                                    {block.content}
                                  </SyntaxHighlighter>
                                </div>
                              </div>
                            ) : (
                              <div key={i} className="mb-2 xs:mb-3 w-full">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p: ({node, ...props}) => <p className="mb-1.5 xs:mb-2 break-words" {...props} />,
                                    ul: ({node, ...props}) => <ul className="mb-1.5 xs:mb-2 pl-3 xs:pl-4 list-disc w-full pr-1" {...props} />,
                                    ol: ({node, ...props}) => <ol className="mb-1.5 xs:mb-2 pl-3 xs:pl-4 list-decimal w-full pr-1" {...props} />,
                                    li: ({node, ...props}) => <li className="mb-0.5 xs:mb-1 break-words pr-1" {...props} />
                                  }}
                                >
                                  {block.content || ''}
                                </ReactMarkdown>
                              </div>
                            )
                          )
                        ) : (
                          formatMessage(message.content)
                        )}
                      </div>
                      {/* Copy icon for assistant messages */}
                      {message.role === "assistant" && (
                        <button
                          className={cn(
                            "ml-1 xs:ml-2 p-0.5 xs:p-1 rounded transition-colors duration-200 flex-shrink-0",
                            copiedIndex === index ? "bg-green-100 text-green-600" : "hover:bg-muted"
                          )}
                          title={copiedIndex === index ? "Copied!" : "Copy response"}
                          onClick={() => handleCopy(message.content, index)}
                          type="button"
                        >
                          {copiedIndex === index ? (
                            <Check className="h-3 xs:h-4 w-3 xs:w-4 animate-bounce" />
                          ) : (
                            <Copy className="h-3 xs:h-4 w-3 xs:w-4 text-muted-foreground" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                  {partialResponse && (
                    <div 
                      className="flex items-start gap-1 xs:gap-2 rounded-lg p-2 xs:p-3 bg-secondary/60 self-start max-w-[85vw] xs:max-w-[90vw] sm:max-w-[80%] md:max-w-[75%]"
                    >
                      <div className="w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 relative flex-shrink-0">
                        <Image 
                          src="/Logo.png" 
                          alt="IntelliBot Logo" 
                          fill
                          className="object-contain"
                        />
                      </div>
                      <div className="whitespace-pre-wrap text-xs xs:text-sm flex-1 break-words pr-1 w-full relative">
                        {splitCodeAndExplanation(autoFormatCodeBlocks(partialResponse)).map((block, i) =>
                          block.type === 'code' ? (
                            <div key={i} className="my-1 xs:my-2 relative group w-full">
                              <div className="w-full">
                                <SyntaxHighlighter
                                  language={block.lang}
                                  style={oneDark}
                                  customStyle={{ 
                                    borderRadius: '6px', 
                                    padding: '0.75em 1em', 
                                    fontSize: '0.75em',
                                    margin: 0, 
                                    width: '100%'
                                  }}
                                  showLineNumbers={false}
                                  wrapLongLines={true}
                                >
                                  {block.content}
                                </SyntaxHighlighter>
                              </div>
                            </div>
                          ) : (
                            <div key={i} className="mb-2 xs:mb-3 w-full">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({node, ...props}) => <p className="mb-1.5 xs:mb-2 break-words" {...props} />,
                                  ul: ({node, ...props}) => <ul className="mb-1.5 xs:mb-2 pl-3 xs:pl-4 list-disc w-full pr-1" {...props} />,
                                  ol: ({node, ...props}) => <ol className="mb-1.5 xs:mb-2 pl-3 xs:pl-4 list-decimal w-full pr-1" {...props} />,
                                  li: ({node, ...props}) => <li className="mb-0.5 xs:mb-1 break-words pr-1" {...props} />
                                }}
                              >
                                {block.content || ''}
                              </ReactMarkdown>
                            </div>
                          )
                        )}
                        <span className="blinking-cursor inline-block ml-0.5">|</span>
                      </div>
                    </div>
                  )}
                  {isLoading && !partialResponse && (
                    <div className="flex items-center gap-1 xs:gap-2 p-2 xs:p-3 text-muted-foreground">
                      <Loader2 className="animate-spin h-3 xs:h-4 w-3 xs:w-4" />
                      <span>IntelliBot is typing...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
          
          {/* Fixed input area */}
          <CardFooter className="px-1 xs:px-2 sm:px-4 md:px-6 !py-0 border-t shrink-0 !mb-0">
            <form onSubmit={handleSendMessage} className="w-full flex gap-2 xs:gap-3 py-3 xs:py-4 items-end">
              <Textarea
                ref={inputRef}
                placeholder="Type your message here..."
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  const ta = inputRef.current;
                  if (ta) {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                  }
                }}
                onKeyDown={handleInputKeyDown}
                disabled={isLoading}
                className="flex-1 text-xs xs:text-sm min-h-[2.5rem] xs:min-h-[3rem] max-h-36 px-4 py-3 rounded-md shadow-sm focus:ring-1 focus:ring-primary resize-none"
                rows={1}
              />
              {isTyping ? (
                <Button 
                  type="button" 
                  onClick={() => pauseResponseRef.current()}
                  className="h-10 xs:h-12 px-3 xs:px-4 bg-amber-600 hover:bg-amber-700 self-end"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 xs:h-4 xs:w-4">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                  <span className="sr-only">Pause response</span>
                </Button>
              ) : (
                <Button 
                  type="submit" 
                  disabled={isLoading || !input.trim()} 
                  className="h-10 xs:h-12 px-3 xs:px-4 self-end"
                >
                  {isLoading ? <Loader2 className="h-3 xs:h-4 xs:w-4 animate-spin" /> : <Send className="h-3 xs:h-4 xs:w-4" />}
                  <span className="sr-only">Send message</span>
                </Button>
              )}
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
