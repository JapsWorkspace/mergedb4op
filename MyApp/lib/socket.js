import { io } from "socket.io-client";

import { getApiBaseUrl } from "./api";

let socketInstance = null;
let socketBaseUrl = "";

export async function getSocket() {
  const baseUrl = await getApiBaseUrl();

  if (!socketInstance || socketBaseUrl !== baseUrl) {
    if (socketInstance) {
      socketInstance.disconnect();
    }

    socketBaseUrl = baseUrl;
    socketInstance = io(baseUrl, {
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
  }

  if (!socketInstance.connected) {
    socketInstance.connect();
  }

  return socketInstance;
}

export function getActiveSocket() {
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
  }
}
