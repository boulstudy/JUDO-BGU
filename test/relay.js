// Minimal stand-in for Supabase Realtime: implements just enough of the
// Phoenix channel protocol for the app's broadcast usage.
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8899);
const wss = new WebSocketServer({ port: PORT });
const topics = new Map(); // topic -> Set<ws>

wss.on('connection', ws => {
  ws.topics = new Set();
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }

    if (m.topic === 'phoenix' && m.event === 'heartbeat') {
      ws.send(JSON.stringify({ topic:'phoenix', event:'phx_reply', payload:{ status:'ok', response:{} }, ref:m.ref }));
      return;
    }

    if (m.event === 'phx_join') {
      ws.topics.add(m.topic);
      if (!topics.has(m.topic)) topics.set(m.topic, new Set());
      topics.get(m.topic).add(ws);
      ws.send(JSON.stringify({ topic:m.topic, event:'phx_reply', payload:{ status:'ok', response:{ postgres_changes: [] } }, ref:m.ref }));
      console.log('[relay] join', m.topic, 'members:', topics.get(m.topic).size);
      return;
    }

    if (m.event === 'broadcast') {
      const peers = topics.get(m.topic);
      if (!peers) return;
      const out = JSON.stringify({ topic:m.topic, event:'broadcast', payload:m.payload, ref:null });
      // self:false — never echo to the sender
      peers.forEach(p => { if (p !== ws && p.readyState === 1) p.send(out); });
      return;
    }
  });

  ws.on('close', () => {
    ws.topics.forEach(t => { const s = topics.get(t); if (s) s.delete(ws); });
  });
});

console.log('[relay] listening on ws://127.0.0.1:' + PORT);
