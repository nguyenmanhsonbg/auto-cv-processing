import { io, Socket } from 'socket.io-client';
import { WebSocketEvents } from '@interview-assistant/shared';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = window.location.origin;
    socket = io(url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function joinSession(sessionId: string, role?: string, name?: string, email?: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit(WebSocketEvents.SESSION_JOIN, { sessionId, role, name, email });
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export { WebSocketEvents };
