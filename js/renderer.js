class Renderer {
  constructor(ctx, camera) {
    this.ctx = ctx;
    this.camera = camera;
  }

  _visible() {
    const T = CONFIG.TILE, cam = this.camera;
    return {
      sc: Math.max(0, Math.floor(cam.x / T)),
      sr: Math.max(0, Math.floor(cam.y / T)),
      ec: Math.min(CONFIG.MAP_W, Math.ceil((cam.x + cam.viewW) / T)),
      er: Math.min(CONFIG.MAP_H, Math.ceil((cam.y + cam.viewH) / T)),
    };
  }

  clear() {
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  beginFrame() { this.ctx.save(); this.ctx.scale(this.camera.zoom, this.camera.zoom); }
  endFrame() { this.ctx.restore(); }

  // ── Ground ──
  drawGround(world) {
    const { ctx } = this;
    const T = CONFIG.TILE, cam = this.camera;
    const { sc, sr, ec, er } = this._visible();

    for (let r = sr; r < er; r++) {
      for (let c = sc; c < ec; c++) {
        const type = world.ground[r][c];
        const v = world.groundVar[r][c];
        const palette = CONFIG.COLORS[type.toUpperCase()];
        ctx.fillStyle = palette ? palette[v % palette.length] : '#333';
        ctx.fillRect(c * T - cam.x, r * T - cam.y, T, T);
      }
    }

    ctx.strokeStyle = CONFIG.COLORS.GRID_LINE;
    ctx.lineWidth = 1;
    for (let c = sc; c <= ec; c++) {
      const x = c * T - cam.x + 0.5;
      ctx.beginPath(); ctx.moveTo(x, sr * T - cam.y); ctx.lineTo(x, er * T - cam.y); ctx.stroke();
    }
    for (let r = sr; r <= er; r++) {
      const y = r * T - cam.y + 0.5;
      ctx.beginPath(); ctx.moveTo(sc * T - cam.x, y); ctx.lineTo(ec * T - cam.x, y); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(200,200,50,0.15)'; ctx.lineWidth = 1; ctx.setLineDash([6, 10]);
    for (let r = sr; r < er; r++) {
      for (let c = sc; c < ec; c++) {
        if (world.ground[r][c] !== 'road') continue;
        if (c + 1 < CONFIG.MAP_W && world.ground[r][c + 1] === 'road') {
          const y = r * T - cam.y + T / 2 + 0.5;
          ctx.beginPath(); ctx.moveTo(c * T - cam.x, y); ctx.lineTo((c + 1) * T - cam.x, y); ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
  }

  // ── Ruins ──
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  drawRuins(world) {
    const { ctx } = this;
    const T = CONFIG.TILE, cam = this.camera;
    const { sc, sr, ec, er } = this._visible();

    for (let r = sr; r < er; r++) {
      for (let c = sc; c < ec; c++) {
        const ruin = world.getRuin(c, r);
        if (!ruin) continue;
        const def = RUINS[ruin.type];
        const sx = c * T - cam.x, sy = r * T - cam.y;

        if (ruin.type === 'half_wall') {
          const edge = ruin.edge || 'top';
          const thick = T * 0.3;
          let wx, wy, ww, wh;

          if (edge === 'top') {
            ww = T - 2; wh = thick; wx = sx + 1; wy = sy;
          } else if (edge === 'bottom') {
            ww = T - 2; wh = thick; wx = sx + 1; wy = sy + T - thick;
          } else if (edge === 'left') {
            ww = thick; wh = T - 2; wx = sx; wy = sy + 1;
          } else {
            ww = thick; wh = T - 2; wx = sx + T - thick; wy = sy + 1;
          }

          ctx.fillStyle = def.color;
          this._roundRect(ctx, wx, wy, ww, wh, 2);
          ctx.fill();
          ctx.strokeStyle = def.border; ctx.lineWidth = 1;
          this._roundRect(ctx, wx, wy, ww, wh, 2);
          ctx.stroke();
          // Detail line
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
          ctx.beginPath();
          if (edge === 'top' || edge === 'bottom') {
            ctx.moveTo(wx + 3, wy + wh / 2); ctx.lineTo(wx + ww - 3, wy + wh / 2);
          } else {
            ctx.moveTo(wx + ww / 2, wy + 3); ctx.lineTo(wx + ww / 2, wy + wh - 3);
          }
          ctx.stroke();
        } else if (ruin.type === 'ruin_door') {
          // Doorway — blend with concrete floor, no visible frame
          const v = world.groundVar[r]?.[c] || 0;
          const palette = CONFIG.COLORS.CONCRETE;
          ctx.fillStyle = palette[v % palette.length];
          ctx.fillRect(sx, sy, T, T);
        } else if (ruin.type === 'wood_wall' || ruin.type === 'wood_floor') {
          // Wood blocks — plank pattern
          ctx.fillStyle = def.color;
          this._roundRect(ctx, sx + 1, sy + 1, T - 2, T - 2, 3);
          ctx.fill();
          // Plank lines
          ctx.strokeStyle = def.border; ctx.lineWidth = 0.7;
          for (let i = 1; i < 4; i++) {
            const py = sy + 1 + i * (T - 2) / 4;
            ctx.beginPath(); ctx.moveTo(sx + 3, py); ctx.lineTo(sx + T - 3, py); ctx.stroke();
          }
          ctx.strokeStyle = def.border; ctx.lineWidth = 1.5;
          this._roundRect(ctx, sx + 1, sy + 1, T - 2, T - 2, 3);
          ctx.stroke();
        } else if (ruin.type === 'scrap') {
          // Scattered scrap pieces on ground
          ctx.fillStyle = def.color;
          ctx.fillRect(sx + 4, sy + 6, 10, 5);
          ctx.fillRect(sx + 18, sy + 12, 8, 4);
          ctx.fillRect(sx + 8, sy + 20, 12, 4);
          ctx.fillStyle = def.border;
          ctx.fillRect(sx + 14, sy + 3, 6, 3);
          ctx.fillRect(sx + 3, sy + 14, 5, 6);
          ctx.fillRect(sx + 22, sy + 22, 7, 3);
        } else {
          // Standard wall/floor — rounded corners
          ctx.fillStyle = def.color;
          this._roundRect(ctx, sx + 1, sy + 1, T - 2, T - 2, 4);
          ctx.fill();
          ctx.strokeStyle = def.border; ctx.lineWidth = 1.5;
          this._roundRect(ctx, sx + 1, sy + 1, T - 2, T - 2, 4);
          ctx.stroke();

          if (ruin.type === 'ruin_wall_damaged') {
            ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx + 6, sy + 5); ctx.lineTo(sx + 14, sy + 13);
            ctx.moveTo(sx + 18, sy + 8); ctx.lineTo(sx + 24, sy + 20);
            ctx.stroke();
          }
          if (ruin.type === 'shop_counter') {
            ctx.fillStyle = '#6a5a3a';
            ctx.fillRect(sx + 3, sy + T / 2 - 2, T - 6, 4);
          }
        }
      }
    }
  }

  // ── Resources ──
  drawResources(world) {
    const { ctx } = this;
    const T = CONFIG.TILE, cam = this.camera;
    const { sc, sr, ec, er } = this._visible();
    const drawn = new Set();

    for (let r = sr; r < er; r++) {
      for (let c = sc; c < ec; c++) {
        const res = world.getResource(c, r);
        if (!res || drawn.has(res.id)) continue;
        drawn.add(res.id);
        const px = res.size * T;
        const sx = res.col * T - cam.x, sy = res.row * T - cam.y;
        const cx = sx + px / 2, cy = sy + px / 2;

        switch (res.type) {
          case 'tree':       this._drawTree(cx, cy, px); break;
          case 'dead_tree':  this._drawDeadTree(cx, cy); break;
          case 'rock':       this._drawRock(cx, cy, px); break;
          case 'bush':       this._drawBush(cx, cy); break;
          case 'car_wreck':  this._drawCarWreck(sx, sy, px); break;
          case 'rubble':     this._drawRubble(cx, cy); break;
          case 'loot_crate': this._drawLootCrate(sx, sy, T); break;
        }
      }
    }
  }

  _drawTree(cx, cy, size) {
    const { ctx } = this; const r = size * 0.44;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(cx + 1, cy + 2, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a6b1a'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a8a2a'; ctx.beginPath(); ctx.arc(cx - r * 0.18, cy - r * 0.1, r * 0.65, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3aaa3a'; ctx.beginPath(); ctx.arc(cx + r * 0.15, cy - r * 0.25, r * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5C3A1E'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#145014'; ctx.lineWidth = Math.max(1.5, size / 24);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }

  _drawDeadTree(cx, cy) {
    const { ctx } = this;
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(cx - 3, cy - 8, 6, 16);
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4); ctx.lineTo(cx - 8, cy - 12);
    ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 7, cy - 14);
    ctx.moveTo(cx, cy - 1); ctx.lineTo(cx - 6, cy - 8);
    ctx.stroke();
    ctx.fillStyle = '#4a3a28'; ctx.beginPath(); ctx.ellipse(cx, cy + 8, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawRock(cx, cy, size) {
    const { ctx } = this; const s = size / 32;
    ctx.fillStyle = '#7a7a7a'; ctx.beginPath();
    ctx.moveTo(cx-10*s,cy+8*s); ctx.lineTo(cx-12*s,cy-3*s); ctx.lineTo(cx-6*s,cy-10*s);
    ctx.lineTo(cx+5*s,cy-11*s); ctx.lineTo(cx+12*s,cy-5*s); ctx.lineTo(cx+11*s,cy+7*s);
    ctx.lineTo(cx+3*s,cy+10*s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#999'; ctx.beginPath();
    ctx.moveTo(cx-6*s,cy-10*s); ctx.lineTo(cx+5*s,cy-11*s);
    ctx.lineTo(cx+4*s,cy-3*s); ctx.lineTo(cx-4*s,cy-4*s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = Math.max(1,s); ctx.beginPath();
    ctx.moveTo(cx-10*s,cy+8*s); ctx.lineTo(cx-12*s,cy-3*s); ctx.lineTo(cx-6*s,cy-10*s);
    ctx.lineTo(cx+5*s,cy-11*s); ctx.lineTo(cx+12*s,cy-5*s); ctx.lineTo(cx+11*s,cy+7*s);
    ctx.lineTo(cx+3*s,cy+10*s); ctx.closePath(); ctx.stroke();
  }

  _drawBush(cx, cy) {
    const { ctx } = this;
    ctx.fillStyle = '#3a8a3a'; ctx.beginPath(); ctx.arc(cx-3,cy,8,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+3,cy-1,7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#4aaa4a'; ctx.beginPath(); ctx.arc(cx,cy-2,5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#2a6a2a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx,cy,9,0,Math.PI*2); ctx.stroke();
  }

  _drawScrapPile(cx, cy) {
    const { ctx } = this;
    ctx.fillStyle = '#8a8a7a'; ctx.fillRect(cx-8,cy+2,7,5);
    ctx.fillStyle = '#6a6a5a'; ctx.fillRect(cx-3,cy-4,9,6);
    ctx.fillStyle = '#9a9080'; ctx.fillRect(cx+1,cy+1,8,4);
    ctx.fillStyle = '#8a5a3a'; ctx.fillRect(cx-5,cy+3,3,2); ctx.fillRect(cx+3,cy-2,2,3);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(cx-9,cy-5,18,14);
  }

  _drawCarWreck(sx, sy, size) {
    const { ctx } = this;
    const w = size, h = size;
    const cx = sx + w / 2, cy = sy + h / 2;

    // Car body — top-down sedan shape
    ctx.fillStyle = '#5a4030';
    this._roundRect(ctx, sx + w * 0.15, sy + h * 0.08, w * 0.7, h * 0.84, w * 0.12);
    ctx.fill();

    // Roof
    ctx.fillStyle = '#4a3525';
    this._roundRect(ctx, sx + w * 0.22, sy + h * 0.28, w * 0.56, h * 0.4, w * 0.08);
    ctx.fill();

    // Windshield (front)
    ctx.fillStyle = '#4a6a7a';
    this._roundRect(ctx, sx + w * 0.25, sy + h * 0.18, w * 0.5, h * 0.14, 3);
    ctx.fill();

    // Rear window
    ctx.fillStyle = '#4a6a7a';
    this._roundRect(ctx, sx + w * 0.28, sy + h * 0.66, w * 0.44, h * 0.1, 3);
    ctx.fill();

    // Tires (4 corners)
    ctx.fillStyle = '#1a1a1a';
    const tw = w * 0.12, th = h * 0.16, tr = 2;
    // Front left
    this._roundRect(ctx, sx + w * 0.06, sy + h * 0.14, tw, th, tr); ctx.fill();
    // Front right
    this._roundRect(ctx, sx + w * 0.82, sy + h * 0.14, tw, th, tr); ctx.fill();
    // Rear left
    this._roundRect(ctx, sx + w * 0.06, sy + h * 0.68, tw, th, tr); ctx.fill();
    // Rear right
    this._roundRect(ctx, sx + w * 0.82, sy + h * 0.68, tw, th, tr); ctx.fill();

    // Rust patches
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(sx + w * 0.2, sy + h * 0.5, w * 0.15, h * 0.08);
    ctx.fillRect(sx + w * 0.6, sy + h * 0.75, w * 0.12, h * 0.06);

    // Outline
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
    this._roundRect(ctx, sx + w * 0.15, sy + h * 0.08, w * 0.7, h * 0.84, w * 0.12);
    ctx.stroke();
  }

  _drawRubble(cx, cy) {
    const { ctx } = this;
    ctx.fillStyle = '#7a7068'; ctx.fillRect(cx-7,cy-2,6,5);
    ctx.fillStyle = '#6a6058'; ctx.fillRect(cx-2,cy-5,8,4);
    ctx.fillStyle = '#8a7a6a'; ctx.fillRect(cx+1,cy+1,5,5);
  }

  _drawLootCrate(sx, sy, T) {
    const { ctx } = this;
    ctx.fillStyle = '#8a7040'; ctx.fillRect(sx+4,sy+4,T-8,T-8);
    ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 2; ctx.strokeRect(sx+4,sy+4,T-8,T-8);
    ctx.fillStyle = '#aa9050'; ctx.fillRect(sx+T/2-3,sy+T/2-2,6,4);
    ctx.strokeStyle = '#cc9944'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(sx+8,sy+8); ctx.lineTo(sx+T-8,sy+T-8);
    ctx.moveTo(sx+T-8,sy+8); ctx.lineTo(sx+8,sy+T-8); ctx.stroke();
  }

  // ── Objectives ──
  drawObjectives(objectives) {
    const { ctx } = this;
    const cam = this.camera;
    const T = CONFIG.TILE;
    const capRadius = CONFIG.OBJECTIVES.CAPTURE_RADIUS * T;

    for (const obj of objectives.points) {
      const sx = obj.x - cam.x, sy = obj.y - cam.y;

      // Capture zone circle
      const controlColor = obj.control > 0.5 ? 'rgba(60,120,255,0.12)'
        : obj.control < -0.5 ? 'rgba(255,60,60,0.12)' : 'rgba(255,255,255,0.06)';
      ctx.fillStyle = controlColor;
      ctx.beginPath(); ctx.arc(sx, sy, capRadius, 0, Math.PI * 2); ctx.fill();

      const borderColor = obj.control > 0.5 ? 'rgba(60,120,255,0.4)'
        : obj.control < -0.5 ? 'rgba(255,60,60,0.4)' : 'rgba(255,255,255,0.2)';
      ctx.strokeStyle = borderColor; ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(sx, sy, capRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // Flag icon
      ctx.fillStyle = obj.control > 0.5 ? '#4488ff' : obj.control < -0.5 ? '#ff4444' : '#aaa';
      ctx.fillRect(sx - 1, sy - 14, 2, 20); // pole
      ctx.fillRect(sx + 1, sy - 14, 10, 7); // flag

      // Label
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(obj.label, sx, sy + 10);

      // Capture progress bar
      const bw = 30;
      ctx.fillStyle = '#222'; ctx.fillRect(sx - bw / 2, sy + 20, bw, 4);
      if (obj.control > 0) {
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(sx - bw / 2, sy + 20, bw * obj.control, 4);
      } else if (obj.control < 0) {
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(sx - bw / 2, sy + 20, bw * Math.abs(obj.control), 4);
      }
    }
  }

  // ── Units ──
  drawUnit(unit, isSelected) {
    const { ctx } = this;
    const cam = this.camera;
    const sx = unit.x - cam.x, sy = unit.y - cam.y;
    const isPlayer = unit.team === 'player';

    if (unit.dead) {
      // Dead unit — desaturated body, no hands/gun
      const deadColor = isPlayer ? '#5a6a80' : '#806a5a';
      const deadDark = isPlayer ? '#3a4a5a' : '#5a4a3a';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = deadColor;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = deadDark;
      ctx.beginPath(); ctx.arc(sx, sy, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    const angle = unit.aimAngle;

    // Team colors — clean blue vs red
    const bodyColor = isPlayer ? '#3b7ddd' : '#dd3b3b';
    const bodyDark = isPlayer ? '#2b5daa' : '#aa2b2b';
    const handColor = isPlayer ? '#5599ee' : '#ee5555';
    const handDark = isPlayer ? '#3377cc' : '#cc3333';
    const outlineColor = isPlayer ? '#1a3a6a' : '#6a1a1a';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(sx, sy + 4, 9, 4, 0, 0, Math.PI * 2); ctx.fill();

    // ── Gun (class-specific, top-down view) ──
    const cls = unit.className || 'rifleman';
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);

    if (cls === 'rifleman') {
      // Long rifle — thin and extended
      ctx.fillStyle = '#4a4020'; ctx.fillRect(0, -2.5, 6, 5);       // stock
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(6, -2, 22, 4);        // long barrel
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(24, -2.5, 4, 5);      // muzzle
      ctx.fillStyle = '#555';    ctx.fillRect(8, -0.8, 16, 1.2);     // barrel highlight
      // Scope
      ctx.fillStyle = '#2a4a5a'; ctx.fillRect(12, -4, 6, 2);
    } else if (cls === 'machinegunner') {
      // Heavy MG — wide and bulky
      ctx.fillStyle = '#4a4020'; ctx.fillRect(-2, -3.5, 8, 7);      // thick stock
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(6, -3, 16, 6);        // wide body
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(18, -3.5, 6, 7);      // barrel shroud
      ctx.fillStyle = '#555';    ctx.fillRect(8, -1, 12, 2);         // highlight
      // Ammo box
      ctx.fillStyle = '#4a4a3a'; ctx.fillRect(4, 3, 8, 4);
      ctx.strokeStyle = '#333';  ctx.lineWidth = 0.5; ctx.strokeRect(4, 3, 8, 4);
    } else if (cls === 'medic') {
      // Pistol — short and compact
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(4, -2, 10, 4);        // slide
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(12, -2.5, 3, 5);      // muzzle
      ctx.fillStyle = '#4a4020'; ctx.fillRect(2, -2.5, 5, 5);       // grip
      ctx.fillStyle = '#555';    ctx.fillRect(5, -0.5, 7, 1);        // highlight
    } else if (cls === 'grenadier') {
      // SMG — medium, with magazine
      ctx.fillStyle = '#4a4020'; ctx.fillRect(0, -2.5, 6, 5);       // grip
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(6, -2, 14, 4);        // body
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(17, -2.5, 4, 5);      // muzzle
      ctx.fillStyle = '#555';    ctx.fillRect(7, -0.5, 10, 1);       // highlight
      // Magazine sticking down
      ctx.fillStyle = '#333';    ctx.fillRect(8, 2, 4, 5);
    } else if (cls === 'brawler') {
      // No gun — just fists forward
    }

    ctx.restore();

    // ── Hands (team colored, positioned per weapon) ──
    let fhDist = 14, rhDist = 7;
    if (cls === 'brawler')       { fhDist = 12; rhDist = 10; }
    else if (cls === 'rifleman')      { fhDist = 18; rhDist = 6; }
    else if (cls === 'machinegunner') { fhDist = 16; rhDist = 5; }
    else if (cls === 'medic')    { fhDist = 10; rhDist = 5; }
    else if (cls === 'grenadier') { fhDist = 13; rhDist = 6; }

    const fhx = sx + Math.cos(angle - 0.12) * fhDist;
    const fhy = sy + Math.sin(angle - 0.12) * fhDist;
    const rhx = sx + Math.cos(angle + 0.2) * rhDist;
    const rhy = sy + Math.sin(angle + 0.2) * rhDist;

    ctx.fillStyle = handColor;
    ctx.beginPath(); ctx.arc(fhx, fhy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rhx, rhy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = handDark; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(fhx, fhy, 3.2, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(rhx, rhy, 3.2, 0, Math.PI * 2); ctx.stroke();

    // ── Body — solid team color ──
    ctx.fillStyle = bodyColor;
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.fill();

    // ── Class indicator ──
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.5;
    const cls2 = unit.className || 'rifleman';
    if (cls2 === 'rifleman') {
      // Crosshair dot
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.stroke();
    } else if (cls2 === 'machinegunner') {
      // Three horizontal bars
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(sx - 3, sy + i * 3 - 0.5, 6, 1.5);
      }
    } else if (cls2 === 'medic') {
      // Plus sign
      ctx.fillRect(sx - 3.5, sy - 1, 7, 2);
      ctx.fillRect(sx - 1, sy - 3.5, 2, 7);
    } else if (cls2 === 'grenadier') {
      // Small diamond
      ctx.beginPath();
      ctx.moveTo(sx, sy - 3.5); ctx.lineTo(sx + 3, sy);
      ctx.lineTo(sx, sy + 3.5); ctx.lineTo(sx - 3, sy);
      ctx.closePath(); ctx.fill();
    } else if (cls2 === 'brawler') {
      // X mark
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 3.5, sy - 3.5); ctx.lineTo(sx + 3.5, sy + 3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + 3.5, sy - 3.5); ctx.lineTo(sx - 3.5, sy + 3.5); ctx.stroke();
    }

    // Outline
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();

    // Leader ring
    if (unit.isLeader) {
      ctx.strokeStyle = isPlayer ? '#6699ff' : '#ff6666';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(sx, sy, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Selection ring
    if (isSelected) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // HP bar
    if (unit.hp < unit.maxHp) {
      const bw = 18;
      ctx.fillStyle = '#222'; ctx.fillRect(sx - bw / 2, sy - 16, bw, 3);
      ctx.fillStyle = isPlayer ? '#4f4' : '#f44';
      ctx.fillRect(sx - bw / 2, sy - 16, bw * (unit.hp / unit.maxHp), 3);
    }

    // (melee arc now handled by EffectSystem)

    // Reload indicator
    if (unit.reloading) {
      const pct = 1 - unit.reloadTimer / unit.reloadTime;
      const bw = 20;
      ctx.fillStyle = '#222'; ctx.fillRect(sx - bw / 2, sy - 20, bw, 3);
      ctx.fillStyle = '#fa0'; ctx.fillRect(sx - bw / 2, sy - 20, bw * pct, 3);
    }

    // Personal medkit indicator (Q key self-heal)
    if (unit.usingMedkit) {
      ctx.fillStyle = '#4f4';
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('+', sx, sy - 20);
    }

    // Status label (friendly always, enemy in spectator/debug)
    if (unit._aiStatus && (isPlayer || this._showEnemyStatus)) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const tw = ctx.measureText(unit._aiStatus).width + 4;
      ctx.fillRect(sx - tw / 2, sy + 13, tw, 10);
      ctx.fillStyle = '#ccc';
      ctx.fillText(unit._aiStatus, sx, sy + 14);
    }
  }

  drawBullets(bullets) {
    const { ctx } = this;
    const cam = this.camera;
    for (const b of bullets) {
      const bx = b.x - cam.x, by = b.y - cam.y;
      ctx.fillStyle = b.team === 'player' ? '#66aaff' : '#ff5544';
      ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(bx - 0.5, by - 0.5, 1, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawLootPrompt(text) {
    // Drawn after endFrame — in screen space
    const { ctx } = this;
    ctx.fillStyle = 'rgba(10,10,20,0.8)';
    const tw = ctx.measureText(text).width + 24;
    const tx = ctx.canvas.width / 2 - tw / 2;
    ctx.fillRect(tx, ctx.canvas.height - 100, tw, 28);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.strokeRect(tx, ctx.canvas.height - 100, tw, 28);
    ctx.fillStyle = '#ddd'; ctx.font = '14px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, ctx.canvas.width / 2, ctx.canvas.height - 86);
  }

  drawLootProgress(pct) {
    const { ctx } = this;
    const w = 120, h = 6;
    const x = ctx.canvas.width / 2 - w / 2, y = ctx.canvas.height - 70;
    ctx.fillStyle = '#222'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#fa0'; ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  }

  drawAmmoHUD(unit) {
    if (!unit || unit.dead) return;
    const { ctx } = this;
    const cx = ctx.canvas.width - 20;
    const cy = ctx.canvas.height - 30;

    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';

    // Clip count — big
    ctx.fillStyle = unit.reloading ? '#fa0' : '#fff';
    ctx.font = 'bold 28px Courier New';
    const clipText = unit.reloading ? 'RLD' : `${unit.ammo}`;
    ctx.fillText(clipText, cx, cy);

    // Reserve — smaller, dimmer
    ctx.fillStyle = '#888';
    ctx.font = '14px Courier New';
    ctx.fillText(`/ ${unit.reserve}`, cx, cy + 16);

    // Label
    ctx.fillStyle = '#555';
    ctx.font = '10px Courier New';
    ctx.fillText('AMMO', cx, cy - 28);
  }

  drawGameOver(winner, reason) {
    const { ctx } = this;
    const w = ctx.canvas.width, h = ctx.canvas.height;

    // Darken screen
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, w, h);

    // Result text
    const isPlayerWin = winner === 'player';
    ctx.fillStyle = isPlayerWin ? '#4488ff' : '#ff4444';
    ctx.font = 'bold 36px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(isPlayerWin ? 'VICTORY' : 'DEFEAT', w / 2, h / 2 - 30);

    ctx.fillStyle = '#aaa';
    ctx.font = '16px Courier New';
    ctx.fillText(reason, w / 2, h / 2 + 15);

    ctx.fillStyle = '#888';
    ctx.font = '13px Courier New';
    ctx.fillText('Returning to menu...', w / 2, h / 2 + 50);
  }

  drawDominationWarning(team, timer, maxTime) {
    const { ctx } = this;
    const w = ctx.canvas.width;
    const isPlayer = team === 'player';
    const remaining = Math.ceil(maxTime - timer);

    ctx.fillStyle = isPlayer ? 'rgba(40,80,200,0.2)' : 'rgba(200,40,40,0.2)';
    ctx.fillRect(0, 0, w, 40);

    ctx.fillStyle = isPlayer ? '#6699ff' : '#ff6666';
    ctx.font = 'bold 16px Courier New';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${isPlayer ? 'BLUE' : 'RED'} TEAM DOMINATION IN ${remaining}s`, w / 2, 20);

    // Progress bar
    const pct = timer / maxTime;
    const barW = 300, barH = 4;
    ctx.fillStyle = '#222';
    ctx.fillRect(w / 2 - barW / 2, 34, barW, barH);
    ctx.fillStyle = isPlayer ? '#4488ff' : '#ff4444';
    ctx.fillRect(w / 2 - barW / 2, 34, barW * pct, barH);
  }

  // ── Minimap ──
  initMinimap(world) {
    const size = 160; this._mmSize = size;
    this._mmCanvas = document.createElement('canvas');
    this._mmCanvas.width = size; this._mmCanvas.height = size;
    const mc = this._mmCanvas.getContext('2d');
    const sx = size / CONFIG.MAP_W, sy = size / CONFIG.MAP_H;
    const biomeColors = { forest: '#2e5a1a', urban: '#5a5a5a', desert: '#a09060' };
    const groundOverrides = { water: '#1a3a55', road: '#3a3a3a' };
    for (let r = 0; r < CONFIG.MAP_H; r++)
      for (let c = 0; c < CONFIG.MAP_W; c++) {
        const gnd = world.ground[r][c];
        mc.fillStyle = groundOverrides[gnd] || biomeColors[world.biome[r][c]] || '#333';
        mc.fillRect(c * sx, r * sy, Math.ceil(sx), Math.ceil(sy));
      }
    mc.fillStyle = '#3a3a3a';
    for (let r = 0; r < CONFIG.MAP_H; r++)
      for (let c = 0; c < CONFIG.MAP_W; c++)
        if (world.ground[r][c] === 'road') mc.fillRect(c * sx, r * sy, Math.ceil(sx), Math.ceil(sy));
    mc.fillStyle = '#777';
    for (const [, ruin] of world.ruins)
      if (ruin.type === 'ruin_wall' || ruin.type === 'ruin_wall_damaged')
        mc.fillRect(ruin.col * sx, ruin.row * sy, Math.ceil(sx), Math.ceil(sy));
  }

  drawMinimap(playerSquad, enemySquad, objectives) {
    if (!this._mmCanvas) return;
    const { ctx } = this;
    const size = this._mmSize, cam = this.camera;
    const pad = 10, ox = ctx.canvas.width - size - pad, oy = pad;
    const sx = size / CONFIG.MAP_W / CONFIG.TILE, sy = size / CONFIG.MAP_H / CONFIG.TILE;
    const visionRange = CONFIG.WORLD.FOG_RADIUS;

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    ctx.drawImage(this._mmCanvas, ox, oy);

    // Viewport rect
    const vx = ox + (cam.x / CONFIG.MAP_PX_W) * size;
    const vy = oy + (cam.y / CONFIG.MAP_PX_H) * size;
    const vw = (cam.viewW / CONFIG.MAP_PX_W) * size;
    const vh = (cam.viewH / CONFIG.MAP_PX_H) * size;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);

    // Player dots (always visible)
    for (const u of playerSquad.alive) {
      ctx.fillStyle = '#4af'; ctx.beginPath();
      ctx.arc(ox + u.x * sx, oy + u.y * sy, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Enemy dots — only visible if within fog radius of a player unit
    for (const u of enemySquad.alive) {
      let visible = false;
      for (const pu of playerSquad.alive) {
        const unitSight = (pu.classDef && pu.classDef.sightRange) || visionRange;
        const d = Math.sqrt((u.x - pu.x) ** 2 + (u.y - pu.y) ** 2) / CONFIG.TILE;
        if (d <= unitSight) { visible = true; break; }
      }
      if (visible) {
        ctx.fillStyle = '#f44'; ctx.beginPath();
        ctx.arc(ox + u.x * sx, oy + u.y * sy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Objective markers (always visible — they're known locations)
    if (objectives) {
      for (const obj of objectives.points) {
        const mx = ox + obj.x * sx, my = oy + obj.y * sy;
        ctx.fillStyle = obj.control > 0.5 ? '#4488ff' : obj.control < -0.5 ? '#ff4444' : '#fff';
        ctx.fillRect(mx - 3, my - 3, 6, 6);
      }
    }

    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(ox - 1, oy - 1, size + 2, size + 2);
  }
}
