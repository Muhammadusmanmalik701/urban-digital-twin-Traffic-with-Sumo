import type { CityUpdate } from '../types/simulation'

type Handler = (data: CityUpdate) => void

class CityWebSocket {
  private ws: WebSocket | null = null
  private handlers: Handler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private url: string

  constructor() {
    this.url = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000') + '/ws'
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      console.log('[WS] Connected to city data stream')
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CityUpdate
        this.handlers.forEach((h) => h(data))
      } catch (e) {
        console.error('[WS] Parse error', e)
      }
    }

    this.ws.onclose = () => {
      console.log('[WS] Disconnected — reconnecting in 3s')
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }

    this.ws.onerror = (e) => {
      console.error('[WS] Error', e)
      this.ws?.close()
    }
  }

  subscribe(handler: Handler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}

export const cityWS = new CityWebSocket()
