# Ableton Remote

Control Ableton Live from your phone browser over local WiFi. No native app required — it's a PWA.

## What it does

- **Transport**: Play, Stop, Record
- **Tempo**: BPM display, +/- nudge, tap tempo
- **Master volume**: fader
- **Mixer**: per-track mute / solo / arm / volume for every track in your session
- **Session view**: tap clip cells to launch them (loads on demand)
- Real-time state sync — changes in Ableton appear on your phone within ~500ms

---

## Setup (one-time)

### 1. Install AbletonOSC in Ableton

AbletonOSC is a free Remote Script that exposes Ableton's API over UDP.

1. Download the latest release from **https://github.com/ideoforms/AbletonOSC** (click Releases → download the zip)
2. Copy the `AbletonOSC` folder into your Remote Scripts directory:
   - **Mac:** `~/Music/Ableton/User Library/Remote Scripts/`
   - **Windows:** `C:\Users\<YourName>\Documents\Ableton\User Library\Remote Scripts\`
3. Open Ableton Live
4. Go to **Preferences → Link/Tempo/MIDI**
5. In the **Control Surface** column, pick a free slot and select **AbletonOSC**
6. Leave Ableton open

> AbletonOSC listens on UDP port `11000` by default and replies on `11001`. No further configuration needed.

### 2. Install server dependencies

```bash
cd ableton-remote/server
npm install
```

### 3. Install client dependencies

```bash
cd ableton-remote/client
npm install
```

---

## Running

### Development (separate terminals)

**Terminal 1 — Bridge server:**
```bash
cd ableton-remote/server
node server.js
```

Output:
```
Ableton Remote server running on http://0.0.0.0:3001
WebSocket endpoint: ws://0.0.0.0:3001/ws
OSC → Ableton:  127.0.0.1:11000
OSC ← Ableton:  UDP 11001
```

**Terminal 2 — React client (dev mode):**
```bash
cd ableton-remote/client
npm run dev
```

Open your phone browser and go to `http://<your-computer-local-ip>:5173`.

To find your computer's local IP:
- **Mac:** `ipconfig getifaddr en0`
- **Windows:** run `ipconfig` and look for the IPv4 address under your WiFi adapter

### Production (single port)

Build the client once, then the server serves everything on port 3001:

```bash
cd ableton-remote/client
npm run build

cd ../server
node server.js
```

Open on your phone: `http://<your-computer-local-ip>:3001`

### Install as PWA on iPhone

1. Open the URL in **Safari** (not Chrome — Safari is required for PWA install on iOS)
2. Tap the **Share** button (box with arrow)
3. Tap **Add to Home Screen**
4. Tap **Add**

The app will appear on your home screen and open full-screen without the browser chrome.

---

## Environment variables (server)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP + WebSocket port |
| `OSC_SEND_PORT` | `11000` | Port AbletonOSC listens on |
| `OSC_RECEIVE_PORT` | `11001` | Port the bridge server receives replies on |
| `OSC_HOST` | `127.0.0.1` | AbletonOSC host (always localhost) |
| `POLL_INTERVAL_MS` | `500` | How often to poll Ableton for transport state (ms) |

Example with custom ports:
```bash
OSC_SEND_PORT=11010 OSC_RECEIVE_PORT=11011 node server.js
```

---

## Troubleshooting

**"Ableton not responding" banner shows**
- Make sure Ableton is open with a session loaded
- Confirm AbletonOSC is selected under Preferences → MIDI → Control Surface
- Check AbletonOSC log: in Ableton, go to Help → Show Log File — look for AbletonOSC messages

**"Connecting to server…" banner stays**
- Make sure `node server.js` is running
- Make sure your phone and computer are on the same WiFi network
- Check firewall: allow incoming connections on port 3001

**Clips show as empty**
- Tap the refresh icon in the Session view header
- Clip loading is on-demand and can take a few seconds for large sessions

**BPM doesn't update after tap tempo**
- Tap at least 4 times in quick succession — the BPM is only sent to Ableton after 4 taps

---

## Architecture

```
Phone Browser (PWA)
       |
   WebSocket JSON
       |
Node.js bridge server (port 3001)
  ├── Express — serves static client build
  ├── WebSocket server — real-time state sync
  └── ableton-osc.js
           |
       UDP OSC
           |
  AbletonOSC Remote Script (inside Ableton Live)
           |
     Ableton Live API
```

The server polls Ableton every 500ms for transport state and every 1000ms for track mixer state. Clip state is fetched on demand when the user opens the Session view.
