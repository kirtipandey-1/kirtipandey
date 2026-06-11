/**
 * ws.js — WebSocket singleton with automatic reconnection.
 */

const WS_PATH = '/ws';
const MAX_RETRIES = 10;

let socket = null;
let retryCount = 0;
let retryTimer = null;

const messageHandlers = new Set();
const statusHandlers = new Set();

function getWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${WS_PATH}`;
}

function notifyStatus(status) {
  for (const h of statusHandlers) h(status);
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  notifyStatus('connecting');
  socket = new WebSocket(getWsUrl());

  socket.onopen = () => {
    retryCount = 0;
    notifyStatus('connected');
  };

  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    for (const h of messageHandlers) h(msg);
  };

  socket.onclose = () => {
    socket = null;
    notifyStatus('disconnected');
    scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose fires after onerror, so no need to handle separately
  };
}

function scheduleReconnect() {
  if (retryTimer) return;
  if (retryCount >= MAX_RETRIES) {
    notifyStatus('failed');
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
  retryCount++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function send(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function onMessage(handler) {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

function onStatusChange(handler) {
  statusHandlers.add(handler);
  return () => statusHandlers.delete(handler);
}

export default { connect, send, onMessage, onStatusChange };
