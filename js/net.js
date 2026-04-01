const Net = {
  _ws: null,
  _handlers: {},
  isHost: false,
  isConnected: false,
  roomCode: null,
  _sendTimer: 0,
  _sendInterval: 1 / 20, // 20Hz

  connect(url) {
    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(url);
      this._ws.onopen = () => { this.isConnected = true; resolve(); };
      this._ws.onerror = (e) => reject(e);
      this._ws.onclose = () => {
        this.isConnected = false;
        this._fire('disconnected', {});
      };
      this._ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        this._fire(msg.type, msg);
      };
    });
  },

  _fire(type, data) {
    const cbs = this._handlers[type];
    if (cbs) for (const cb of cbs) cb(data);
  },

  on(type, handler) {
    if (!this._handlers[type]) this._handlers[type] = [];
    this._handlers[type].push(handler);
  },

  off(type, handler) {
    const cbs = this._handlers[type];
    if (cbs) this._handlers[type] = cbs.filter(h => h !== handler);
  },

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  },

  createRoom() {
    this.isHost = true;
    this._send({ type: 'create_room' });
  },

  joinRoom(code) {
    this.isHost = false;
    this._send({ type: 'join_room', code: code.toUpperCase() });
  },

  getLobbies() {
    this._send({ type: 'get_lobbies' });
  },

  sendReady(classSelections) {
    this._send({ type: 'ready', classSelections });
  },

  sendState(snapshot) {
    this._send({ type: 'state', ...snapshot });
  },

  sendGameOver(winner) {
    this._send({ type: 'game_over', winner });
  },

  disconnect() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this.isConnected = false;
    this.isHost = false;
    this.roomCode = null;
    this._handlers = {};
  },

  // Call each frame with dt; returns true when it's time to send a state update
  shouldSendState(dt) {
    this._sendTimer += dt;
    if (this._sendTimer >= this._sendInterval) {
      this._sendTimer -= this._sendInterval;
      return true;
    }
    return false;
  },

  // Serialize local army units into compact state
  serializeUnits(army) {
    const units = [];
    for (const sq of army.squads) {
      for (const u of sq.units) {
        units.push({
          x: Math.round(u.x * 10) / 10,
          y: Math.round(u.y * 10) / 10,
          vx: Math.round(u.vx * 10) / 10,
          vy: Math.round(u.vy * 10) / 10,
          aim: Math.round(u.aimAngle * 1000) / 1000,
          hp: u.hp,
          dead: u.dead,
          reloading: u.reloading,
          usingMedkit: u.usingMedkit,
          ammo: u.ammo,
          reserve: u.reserve,
          medkits: u.medkits,
          grenades: u.grenades,
          sprintTimer: Math.round(u.sprintTimer * 100) / 100,
          meleeSwing: Math.round(u.meleeSwing * 100) / 100,
        });
      }
    }
    return units;
  },

  // Serialize new bullets fired this tick
  serializeBullets(bullets) {
    return bullets.map(b => ({
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      dx: Math.round(b.dx * 10) / 10,
      dy: Math.round(b.dy * 10) / 10,
      damage: b.damage,
      life: Math.round(b.life * 100) / 100,
    }));
  },

  serializeGrenades(grenades) {
    return grenades.map(g => ({
      x: Math.round(g.x * 10) / 10,
      y: Math.round(g.y * 10) / 10,
      tx: Math.round(g.tx * 10) / 10,
      ty: Math.round(g.ty * 10) / 10,
      dx: Math.round(g.dx * 10) / 10,
      dy: Math.round(g.dy * 10) / 10,
      team: g.team,
      fuse: Math.round(g.fuse * 100) / 100,
      travelLeft: Math.round(g.travelLeft * 100) / 100,
      landed: g.landed,
    }));
  },

  serializeHealZones(zones) {
    return zones.map(h => ({
      x: Math.round(h.x * 10) / 10,
      y: Math.round(h.y * 10) / 10,
      team: h.team,
      timer: Math.round(h.timer * 100) / 100,
      maxTimer: Math.round(h.maxTimer * 100) / 100,
      radius: h.radius,
      healAmount: h.healAmount,
    }));
  },
};
