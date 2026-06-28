"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Search,
  Settings,
  Shield,
  Loader2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DEFAULT_WISP_URL,
  createScramjetFrame,
  initScramjet,
  normalizeWispUrl,
  toNavigableUrl,
  type ScramjetFrameInstance,
} from "@/lib/scramjet"

type Status = "idle" | "booting" | "ready" | "loading" | "error"

export function ScramjetBrowser() {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<ScramjetFrameInstance | null>(null)

  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [address, setAddress] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wispUrl, setWispUrl] = useState(DEFAULT_WISP_URL)
  const [wispDraft, setWispDraft] = useState(DEFAULT_WISP_URL)
  const [hasNavigated, setHasNavigated] = useState(false)

  // Boot Scramjet + attach the proxied iframe.
  const boot = useCallback(
    async (targetWisp: string) => {
      setStatus("booting")
      setError(null)
      try {
        await initScramjet(targetWisp)

        if (!frameRef.current) {
          const frame = createScramjetFrame()
          frame.frame.classList.add("h-full", "w-full", "border-0", "bg-card")
          frame.frame.setAttribute("title", "Proxied content")
          frame.addEventListener("urlchange", (event) => {
            const url = (event as unknown as { url: string }).url
            if (url) {
              setCurrentUrl(url)
              setAddress(url)
              setStatus("ready")
            }
          })
          frame.frame.addEventListener("load", () => setStatus("ready"))
          frameRef.current = frame
          containerRef.current?.appendChild(frame.frame)
        }
        setStatus("ready")
      } catch (err) {
        console.log("[v0] Scramjet boot failed:", err)
        setError(err instanceof Error ? err.message : "Failed to start the proxy")
        setStatus("error")
      }
    },
    [],
  )

  useEffect(() => {
    boot(wispUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navigate = useCallback(
    (input: string) => {
      const url = toNavigableUrl(input)
      if (!url || !frameRef.current) return
      setStatus("loading")
      setHasNavigated(true)
      setCurrentUrl(url)
      frameRef.current.go(url)
    },
    [],
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    navigate(address)
  }

  const applyWisp = async () => {
    const normalized = normalizeWispUrl(wispDraft)
    setWispUrl(normalized)
    setWispDraft(normalized)
    setSettingsOpen(false)
    await boot(normalized)
    if (hasNavigated && currentUrl) navigate(currentUrl)
  }

  const disabled = status === "booting" || status === "error"

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Toolbar */}
      <header className="flex flex-col gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Go back"
              disabled={disabled || !hasNavigated}
              onClick={() => frameRef.current?.back()}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Go forward"
              disabled={disabled || !hasNavigated}
              onClick={() => frameRef.current?.forward()}
            >
              <ArrowRight className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Reload"
              disabled={disabled || !hasNavigated}
              onClick={() => frameRef.current?.reload()}
            >
              {status === "loading" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <RotateCw className="size-5" />
              )}
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Search or enter a website address"
              aria-label="Address bar"
              spellCheck={false}
              autoComplete="off"
              className="h-10 rounded-full pl-9 pr-4"
              disabled={disabled}
            />
          </form>

          <Button
            type="button"
            size="icon"
            variant={settingsOpen ? "secondary" : "ghost"}
            aria-label="Settings"
            onClick={() => {
              setWispDraft(wispUrl)
              setSettingsOpen((v) => !v)
            }}
          >
            <Settings className="size-5" />
          </Button>
        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="wisp" className="text-sm font-medium">
                Wisp server URL
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground text-pretty">
              All traffic is routed through this Wisp WebSocket server. Paste your
              own for reliability and privacy, or use the public default.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wisp"
                value={wispDraft}
                onChange={(e) => setWispDraft(e.target.value)}
                placeholder="wss://your-wisp-server.example/"
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setWispDraft(DEFAULT_WISP_URL)}>
                  Default
                </Button>
                <Button type="button" onClick={applyWisp}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Viewport */}
      <main className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Overlays */}
        {(status === "booting" || status === "error" || (status === "ready" && !hasNavigated)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background p-6">
            <div className="w-full max-w-md text-center">
              {status === "booting" && (
                <>
                  <Loader2 className="mx-auto mb-4 size-8 animate-spin text-primary" />
                  <h2 className="text-lg font-semibold">Starting secure proxy</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Registering the service worker and connecting to the Wisp server…
                  </p>
                </>
              )}

              {status === "error" && (
                <>
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
                    <Shield className="size-6 text-destructive" />
                  </div>
                  <h2 className="text-lg font-semibold">Couldn&apos;t start the proxy</h2>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{error}</p>
                  <Button className="mt-4" onClick={() => boot(wispUrl)}>
                    Try again
                  </Button>
                </>
              )}

              {status === "ready" && !hasNavigated && (
                <>
                  <div className="mx-auto mb-4 flex h-[250px] w-[250px] items-center justify-center">
  <img 
    src="https://raw.githubusercontent.com/skoopplayz/scramducky/a333f58933af35c0a7061f89275e4827da9cfe19/components/ducky.png" 
    alt="Logo" 
    className="h-full w-full object-contain"
  />
</div>
                      <form onSubmit={handleSubmit} className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Search the pond..."
              aria-label="Address bar"
              spellCheck={false}
              autoComplete="off"
              className="h-10 rounded-full pl-9 pr-4"
              disabled={disabled}
            />
          </form>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
