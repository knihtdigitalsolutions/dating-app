import { io, Socket } from 'socket.io-client'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000'

let socket: Socket | null = null

export function getSocket(accessToken: string): Socket {
  if (socket?.connected) return socket

  socket = io(WS_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  })

  socket.on('connect', () => console.log('[Socket] Connected'))
  socket.on('disconnect', (r) => console.log('[Socket] Disconnected:', r))
  socket.on('connect_error', (e) => console.error('[Socket] Error:', e.message))

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
