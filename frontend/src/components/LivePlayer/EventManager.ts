// ─── IPGenZ Live Player v2 — Event Manager ───────────────────────────────────
// Central event bus. No direct component-to-component communication.
// All modules communicate exclusively through this bus.

import type { PlayerEvent } from './types'

type EventHandler = (...args: any[]) => void

export class EventManager {
  private listeners: Map<PlayerEvent | string, Set<EventHandler>> = new Map()
  private destroyed = false

  on(event: PlayerEvent | string, handler: EventHandler): () => void {
    if (this.destroyed) return () => {}
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    // Returns an unsubscribe function
    return () => this.off(event, handler)
  }

  off(event: PlayerEvent | string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  emit(event: PlayerEvent | string, ...args: any[]): void {
    if (this.destroyed) return
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(...args)
      } catch (e) {
        console.warn(`[EventManager] Handler error for event "${event}":`, e)
      }
    })
  }

  removeAll(): void {
    this.listeners.clear()
  }

  destroy(): void {
    this.removeAll()
    this.destroyed = true
  }
}
