import { io, Socket } from 'socket.io-client'
import { API_URL } from './api'

let socket: Socket | null = null

export function getSocket(accessToken: string): Socket {
  if (socket?.connected) return socket

  socket = io(API_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  })

  socket.on('connect', () => console.log('Socket connected'))
  socket.on('disconnect', (reason) => console.log('Socket disconnected:', reason))
  socket.on('connect_error', (err) => console.error('Socket error:', err.message))

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export { socket }
