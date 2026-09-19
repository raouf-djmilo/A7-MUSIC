import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';

const SOCKET_URL = API_BASE_URL.replace('/api', '');

let socket: Socket | null = null;

// ─── Single source of truth for the socket singleton ─────────────────────────
export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  }
  return socket;
};

// ✅ Just connects the socket — registration is FULLY owned by PresenceProvider
export const connectSocket = (): Socket => {
  const s = getSocket();
  if (!s.connected && !s.active) {
    s.connect();
  }
  return s;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
