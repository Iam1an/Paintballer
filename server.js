const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ── Static file server ──
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(data);
  });
});

// ── WebSocket server ──
const wss = new WebSocketServer({ server });
const rooms = new Map(); // code -> { host, guest, hostReady, guestReady, hostSelections, guestSelections }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function getOther(room, ws) {
  return ws === room.host ? room.guest : room.host;
}

function findRoom(ws) {
  for (const [code, room] of rooms) {
    if (room.host === ws || room.guest === ws) return { code, room };
  }
  return null;
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'create_room': {
        const code = generateCode();
        rooms.set(code, { host: ws, guest: null, hostReady: false, guestReady: false });
        send(ws, { type: 'room_created', code });

        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room || room.guest) {
          send(ws, { type: 'error', message: 'Room not found or full' });
          return;
        }
        room.guest = ws;
        send(ws, { type: 'room_joined', code });
        send(room.host, { type: 'opponent_joined' });

        break;
      }

      case 'ready': {
        const found = findRoom(ws);
        if (!found) return;
        const { code, room } = found;
        if (ws === room.host) {
          room.hostReady = true;
          room.hostSelections = msg.classSelections;
        } else {
          room.guestReady = true;
          room.guestSelections = msg.classSelections;
        }

        if (room.hostReady && room.guestReady) {
          const seed = Math.floor(Math.random() * 2147483647);
          const startMsg = {
            type: 'game_start',
            seed,
            hostSelections: room.hostSelections,
            guestSelections: room.guestSelections,
          };
          send(room.host, startMsg);
          send(room.guest, startMsg);

        }
        break;
      }

      case 'state': {
        const found = findRoom(ws);
        if (!found) return;
        const other = getOther(found.room, ws);
        send(other, msg);
        break;
      }

      case 'game_over': {
        const found = findRoom(ws);
        if (!found) return;
        const other = getOther(found.room, ws);
        send(other, msg);
        break;
      }
    }
  });

  ws.on('close', () => {
    const found = findRoom(ws);
    if (!found) return;
    const { code, room } = found;
    const other = getOther(room, ws);
    send(other, { type: 'opponent_left' });
    rooms.delete(code);
  });
});

server.listen(PORT, () => {
  console.log(`Paintballer server running on http://localhost:${PORT}`);
});
