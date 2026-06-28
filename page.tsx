"use client"

import dynamic from "next/dynamic"

// Scramjet relies on the service worker, WASM, and the DOM, so it must run
// only on the client.
const ScramjetBrowser = dynamic(
  () => import("@/components/scramjet-browser").then((m) => m.ScramjetBrowser),
  { ssr: false },
)

export default function Page() {
  return <ScramjetBrowser />
}
