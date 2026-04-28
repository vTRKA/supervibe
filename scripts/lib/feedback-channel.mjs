import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAcceptKey(clientKey) {
  return createHash('sha1').update(clientKey + WS_GUID).digest('base64');
}

function isWsUpgrade(req) {
  const up = (req.headers.upgrade || '').toLowerCase();
  const conn = (req.headers.connection || '').toLowerCase();
  return up === 'websocket' && conn.includes('upgrade') && req.headers['sec-websocket-key'];
}

function performWsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = wsAcceptKey(key);
  const lines = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ];
  socket.write(lines.join('\r\n'));
}

export function parseWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const fin = (buffer[0] & 0x80) !== 0;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let len = buffer[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < offset + 2) return null;
    len = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buffer.length < offset + 8) return null;
    len = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  let mask = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + len) return null;
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    payload[i] = masked ? buffer[offset + i] ^ mask[i % 4] : buffer[offset + i];
  }
  return { fin, opcode, payload, totalLen: offset + len };
}

function buildWsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

export function createFeedbackChannel({ queuePath }) {
  const clients = new Set();

  async function submit(entry) {
    const full = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await mkdir(dirname(queuePath), { recursive: true });
    await appendFile(queuePath, JSON.stringify(full) + '\n', 'utf8');
    return full;
  }

  function attachUpgrade(server) {
    server.on('upgrade', (req, socket) => {
      if (!isWsUpgrade(req) || !req.url.startsWith('/_feedback')) {
        socket.destroy();
        return;
      }
      performWsHandshake(req, socket);
      clients.add(socket);
      socket.on('close', () => clients.delete(socket));
      socket.on('error', () => clients.delete(socket));

      let buf = Buffer.alloc(0);
      socket.on('data', async chunk => {
        buf = Buffer.concat([buf, chunk]);
        while (true) {
          const frame = parseWsFrame(buf);
          if (!frame) break;
          buf = buf.slice(frame.totalLen);
          if (frame.opcode === 0x8) { socket.end(); return; }
          if (frame.opcode === 0x1) {
            try {
              const payload = JSON.parse(frame.payload.toString('utf8'));
              const stored = await submit(payload);
              socket.write(buildWsFrame(JSON.stringify({ ack: stored.id })));
            } catch (e) {
              socket.write(buildWsFrame(JSON.stringify({ error: e.message })));
            }
          }
        }
      });
    });
  }

  return { submit, attachUpgrade };
}
