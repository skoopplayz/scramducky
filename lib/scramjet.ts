// Client-side Scramjet bootstrap.
//
// Scramjet runs entirely in the browser: the page loads the prebuilt
// `scramjet.all.js` runtime, registers a service worker that intercepts and
// rewrites proxied requests, and routes the actual network traffic through a
// Wisp WebSocket server via bare-mux + the epoxy transport.

import { BareMuxConnection } from "@mercuryworkshop/bare-mux"

// Minimal typings for the globals injected by /scram/scramjet.all.js
type ScramjetControllerCtor = new (config: {
  prefix?: string
  files?: { wasm: string; all: string; sync: string }
}) => ScramjetControllerInstance

interface ScramjetControllerInstance {
  init: () => Promise<void>
  createFrame: (frame?: HTMLIFrameElement) => ScramjetFrameInstance
  encodeUrl: (url: string | URL) => string
}

export interface ScramjetFrameInstance extends EventTarget {
  frame: HTMLIFrameElement
  url: URL
  go: (url: string | URL) => void
  back: () => void
  forward: () => void
  reload: () => void
}

declare global {
  interface Window {
    $scramjetLoadController: () => { ScramjetController: ScramjetControllerCtor }
  }
}

const SCRAM_PREFIX = "/scramjet/"

let controller: ScramjetControllerInstance | null = null
let connection: BareMuxConnection | null = null
let scriptPromise: Promise<void> | null = null

/** Inject the prebuilt Scramjet runtime script once. */
function loadScramjetScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.$scramjetLoadController) {
      resolve()
      return
    }
    const script = document.createElement("script")
    script.src = "/scram/scramjet.all.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load the Scramjet runtime"))
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Initialize Scramjet: load the runtime, register the service worker, and
 * point bare-mux at the given Wisp server. Safe to call multiple times — the
 * transport will be updated to the latest Wisp URL on each call.
 */
export async function initScramjet(wispUrl: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Scramjet can only be initialized in the browser")
  }
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers")
  }

  await loadScramjetScript()

  if (!controller) {
    const { ScramjetController } = window.$scramjetLoadController()
    controller = new ScramjetController({
      prefix: SCRAM_PREFIX,
      files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js",
      },
    })
    await controller.init()
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    })
    await navigator.serviceWorker.ready
    // Make sure the worker is actually controlling the page before proxying.
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const onChange = () => {
          navigator.serviceWorker.removeEventListener("controllerchange", onChange)
          resolve()
        }
        navigator.serviceWorker.addEventListener("controllerchange", onChange)
        // Fallback in case the controller is already settling.
        registration.active && setTimeout(resolve, 500)
      })
    }
  }

  if (!connection) {
    connection = new BareMuxConnection("/baremux/worker.js")
  }

  // (Re)configure the transport to use the requested Wisp server.
  await connection.setTransport("/epoxy/index.mjs", [{ wisp: normalizeWispUrl(wispUrl) }])
}

/** Create a proxied iframe and return its Scramjet frame controller. */
export function createScramjetFrame(): ScramjetFrameInstance {
  if (!controller) {
    throw new Error("Scramjet has not been initialized yet")
  }
  return controller.createFrame() as unknown as ScramjetFrameInstance
}

/** Turn a user query into a real URL (search if it isn't a URL). */
export function toNavigableUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ""
  // Looks like a domain or full URL.
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const looksLikeDomain = /^[^\s]+\.[^\s]+$/.test(trimmed) && !trimmed.includes(" ")
  if (looksLikeDomain) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

/** Ensure the Wisp URL ends with a trailing slash and uses ws(s). */
export function normalizeWispUrl(url: string): string {
  let value = url.trim()
  if (!value) return value
  if (!/^wss?:\/\//i.test(value)) {
    // Default to wss for safety.
    value = `wss://${value.replace(/^\/\//, "")}`
  }
  if (!value.endsWith("/")) value += "/"
  return value
}

export const DEFAULT_WISP_URL = "wss://wisp.mercurywork.shop/"
