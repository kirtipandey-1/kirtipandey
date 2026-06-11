/**
 * ableton-osc.js
 * Thin wrapper around node-osc for communicating with AbletonOSC Remote Script.
 * AbletonOSC listens on OSC_SEND_PORT (default 11000) and replies on OSC_RECEIVE_PORT (default 11001).
 */

const { Client, Server } = require('node-osc');

const OSC_HOST        = process.env.OSC_HOST         || '127.0.0.1';
const OSC_SEND_PORT   = parseInt(process.env.OSC_SEND_PORT)    || 11000;
const OSC_RECEIVE_PORT= parseInt(process.env.OSC_RECEIVE_PORT) || 11001;
const QUERY_TIMEOUT   = parseInt(process.env.QUERY_TIMEOUT_MS) || 2000;

let oscClient = null;
let oscServer = null;

// path -> { resolve, reject, timeoutId }
const pendingReplies = new Map();

// path -> [handler, ...]  persistent listeners
const listeners = new Map();

function init() {
  oscClient = new Client(OSC_HOST, OSC_SEND_PORT);

  oscServer = new Server(OSC_RECEIVE_PORT, '0.0.0.0', () => {
    console.log(`[OSC] Listening on UDP ${OSC_RECEIVE_PORT}`);
  });

  oscServer.on('message', (msg) => {
    const [path, ...args] = msg;

    // Resolve pending query
    if (pendingReplies.has(path)) {
      const { resolve, timeoutId } = pendingReplies.get(path);
      clearTimeout(timeoutId);
      pendingReplies.delete(path);
      resolve(args);
    }

    // Notify persistent listeners
    if (listeners.has(path)) {
      for (const handler of listeners.get(path)) {
        handler(args);
      }
    }
  });
}

/**
 * Fire-and-forget OSC message.
 */
function send(path, ...args) {
  oscClient.send(path, ...args, (err) => {
    if (err) console.error(`[OSC] send error on ${path}:`, err);
  });
}

/**
 * Send a request and wait for a reply on replyPath.
 * Returns a Promise that resolves with the reply args array.
 */
function query(path, replyPath, ...args) {
  return new Promise((resolve, reject) => {
    // If a pending query for this replyPath already exists, cancel it
    if (pendingReplies.has(replyPath)) {
      clearTimeout(pendingReplies.get(replyPath).timeoutId);
    }

    const timeoutId = setTimeout(() => {
      if (pendingReplies.has(replyPath)) {
        pendingReplies.delete(replyPath);
        reject(new Error(`OSC query timeout: ${path} → ${replyPath}`));
      }
    }, QUERY_TIMEOUT);

    pendingReplies.set(replyPath, { resolve, reject, timeoutId });
    send(path, ...args);
  });
}

/**
 * Register a persistent listener for unsolicited push messages from Ableton.
 */
function on(path, handler) {
  if (!listeners.has(path)) listeners.set(path, []);
  listeners.get(path).push(handler);
}

function close() {
  if (oscClient) oscClient.close();
  if (oscServer) oscServer.close();
}

module.exports = { init, send, query, on, close };
