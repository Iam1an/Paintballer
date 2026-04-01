class UI {
  constructor(onStart, onOnlineStart) {
    this._onStart = onStart;
    this._onOnlineStart = onOnlineStart;
    this.phase = 'mode_select';
    this.gameMode = null; // 'skirmish' (6v6) or 'battle' (30v30)
    this._buildModeSelect();
    this._buildHUD();
  }

  // ── Mode select screen ──
  _buildModeSelect() {
    this.modeOverlay = document.createElement('div');
    this.modeOverlay.id = 'mode-overlay';

    const panel = document.createElement('div');
    panel.id = 'mode-panel';

    const title = document.createElement('div');
    title.id = 'mode-title';
    title.textContent = 'SELECT MODE';
    panel.appendChild(title);

    const btnRow = document.createElement('div');
    btnRow.id = 'mode-btn-row';

    const skirmishBtn = document.createElement('button');
    skirmishBtn.className = 'mode-btn';
    skirmishBtn.innerHTML = '<div class="mode-btn-title">SKIRMISH</div><div class="mode-btn-desc">6 vs 6 — 1 squad per team</div>';
    skirmishBtn.addEventListener('click', () => this._selectMode('skirmish'));

    const battleBtn = document.createElement('button');
    battleBtn.className = 'mode-btn';
    battleBtn.innerHTML = '<div class="mode-btn-title">BATTLE</div><div class="mode-btn-desc">30 vs 30 — 5 squads per team</div>';
    battleBtn.addEventListener('click', () => this._selectMode('battle'));

    const onlineBtn = document.createElement('button');
    onlineBtn.className = 'mode-btn';
    onlineBtn.innerHTML = '<div class="mode-btn-title">ONLINE</div><div class="mode-btn-desc">6 vs 6 — 2 players online</div>';
    onlineBtn.addEventListener('click', () => this._showLobby());

    btnRow.appendChild(skirmishBtn);
    btnRow.appendChild(battleBtn);
    btnRow.appendChild(onlineBtn);
    panel.appendChild(btnRow);

    const fsBtn = document.createElement('button');
    fsBtn.id = 'fullscreen-btn';
    fsBtn.textContent = 'FULLSCREEN (F11)';
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
    panel.appendChild(fsBtn);

    this.modeOverlay.appendChild(panel);
    document.body.appendChild(this.modeOverlay);
  }

  // ── Lobby screen ──
  _showLobby() {
    this.modeOverlay.classList.add('hidden');
    this.phase = 'lobby';

    if (this.lobbyOverlay) this.lobbyOverlay.remove();
    this.lobbyOverlay = document.createElement('div');
    this.lobbyOverlay.id = 'lobby-overlay';

    const panel = document.createElement('div');
    panel.id = 'lobby-panel';

    const title = document.createElement('div');
    title.id = 'lobby-title';
    title.textContent = 'ONLINE BATTLE';
    panel.appendChild(title);

    // Create room
    const createBtn = document.createElement('button');
    createBtn.className = 'mode-btn';
    createBtn.innerHTML = '<div class="mode-btn-title">CREATE GAME</div><div class="mode-btn-desc">Host a room and share the code</div>';
    createBtn.addEventListener('click', () => this._createRoom());
    panel.appendChild(createBtn);

    // Browse lobbies
    const browseBtn = document.createElement('button');
    browseBtn.className = 'mode-btn';
    browseBtn.innerHTML = '<div class="mode-btn-title">BROWSE LOBBIES</div><div class="mode-btn-desc">Find games waiting for opponents</div>';
    browseBtn.addEventListener('click', () => this._showLobbies());
    panel.appendChild(browseBtn);

    // Join room
    const joinRow = document.createElement('div');
    joinRow.id = 'lobby-join-row';
    this._joinInput = document.createElement('input');
    this._joinInput.id = 'lobby-code-input';
    this._joinInput.type = 'text';
    this._joinInput.maxLength = 4;
    this._joinInput.placeholder = 'CODE';
    this._joinInput.style.textTransform = 'uppercase';
    const joinBtn = document.createElement('button');
    joinBtn.id = 'lobby-join-btn';
    joinBtn.textContent = 'JOIN GAME';
    joinBtn.addEventListener('click', () => {
      const code = this._joinInput.value.trim();
      if (code.length === 4) this._joinRoom(code);
    });
    joinRow.appendChild(this._joinInput);
    joinRow.appendChild(joinBtn);
    panel.appendChild(joinRow);

    // Status area
    this._lobbyStatus = document.createElement('div');
    this._lobbyStatus.id = 'lobby-status';
    panel.appendChild(this._lobbyStatus);

    // Back button
    const backBtn = document.createElement('button');
    backBtn.id = 'lobby-back-btn';
    backBtn.textContent = 'BACK';
    backBtn.addEventListener('click', () => {
      Net.disconnect();
      this.lobbyOverlay.remove();
      this.modeOverlay.classList.remove('hidden');
      this.phase = 'mode_select';
    });
    panel.appendChild(backBtn);

    this.lobbyOverlay.appendChild(panel);
    document.body.appendChild(this.lobbyOverlay);
  }

  // ── Lobbies list screen ──
  async _showLobbies() {
    this._lobbyStatus.textContent = 'Loading lobbies...';
    try {
      const wsUrl = `ws://${location.host}`;
      await Net.connect(wsUrl);
      Net.on('lobbies_list', (msg) => {
        this._displayLobbies(msg.lobbies);
      });
      Net.on('error', (msg) => {
        this._lobbyStatus.textContent = msg.message || 'Error loading lobbies';
      });
      Net.getLobbies();
    } catch {
      this._lobbyStatus.textContent = 'Failed to connect to server';
    }
  }

  _displayLobbies(lobbies) {
    // Remove existing lobby list if any
    if (this._lobbiesList) this._lobbiesList.remove();

    this._lobbiesList = document.createElement('div');
    this._lobbiesList.id = 'lobbies-list';

    if (lobbies.length === 0) {
      this._lobbiesList.innerHTML = '<div class="no-lobbies">No open lobbies found. Try creating a game!</div>';
    } else {
      const title = document.createElement('div');
      title.className = 'lobbies-title';
      title.textContent = 'OPEN LOBBIES';
      this._lobbiesList.appendChild(title);

      for (const lobby of lobbies) {
        const lobbyItem = document.createElement('div');
        lobbyItem.className = 'lobby-item';
        lobbyItem.innerHTML = `
          <div class="lobby-code">${lobby.code}</div>
          <div class="lobby-status">${lobby.hostReady ? 'Ready' : 'Setting up'}</div>
          <button class="lobby-join-btn">JOIN</button>
        `;
        const joinBtn = lobbyItem.querySelector('.lobby-join-btn');
        joinBtn.addEventListener('click', () => {
          Net.disconnect(); // Disconnect from the lobby browsing connection
          this._joinRoom(lobby.code);
        });
        this._lobbiesList.appendChild(lobbyItem);
      }
    }

    // Add back button for lobbies
    const backBtn = document.createElement('button');
    backBtn.className = 'lobby-back-btn';
    backBtn.textContent = 'BACK TO LOBBY';
    backBtn.addEventListener('click', () => {
      Net.disconnect();
      this._lobbiesList.remove();
      this._lobbyStatus.textContent = '';
    });
    this._lobbiesList.appendChild(backBtn);

    // Insert after the lobby panel
    const panel = document.getElementById('lobby-panel');
    panel.parentNode.insertBefore(this._lobbiesList, panel.nextSibling);
  }

  async _createRoom() {
    this._lobbyStatus.textContent = 'Connecting...';
    try {
      const wsUrl = `ws://${location.host}`;
      await Net.connect(wsUrl);
      Net.on('room_created', (msg) => {
        Net.roomCode = msg.code;
        this._lobbyStatus.innerHTML = `Room code: <span class="lobby-code">${msg.code}</span>`;
        this.showWaitingOverlay('Waiting for opponent...');
      });
      Net.on('opponent_joined', () => {
        this.hideWaitingOverlay();
        this._lobbyStatus.textContent = 'Opponent joined! Setting up...';
        this._startOnlinePrep();
      });
      Net.on('error', (msg) => {
        this.hideWaitingOverlay();
        this._lobbyStatus.textContent = msg.message || 'Error';
      });
      Net.createRoom();
    } catch {
      this._lobbyStatus.textContent = 'Failed to connect to server';
    }
  }

  async _joinRoom(code) {
    this._lobbyStatus.textContent = 'Connecting...';
    try {
      const wsUrl = `ws://${location.host}`;
      await Net.connect(wsUrl);
      Net.on('room_joined', (msg) => {
        Net.roomCode = msg.code;
        this._lobbyStatus.textContent = 'Joined! Setting up...';
        this.hideWaitingOverlay();
        this._startOnlinePrep();
      });
      Net.on('error', (msg) => {
        this.hideWaitingOverlay();
        this._lobbyStatus.textContent = msg.message || 'Room not found';
      });
      Net.joinRoom(code);
    } catch {
      this.hideWaitingOverlay();
      this._lobbyStatus.textContent = 'Failed to connect to server';
    }
  }

  _startOnlinePrep() {
    this.gameMode = 'online';

    if (this._lobbiesList) {
      this._lobbiesList.remove();
      this._lobbiesList = null;
    }
    if (this.lobbyOverlay) {
      this.lobbyOverlay.remove();
      this.lobbyOverlay = null;
    }

    const squadsCount = 1; // 6v6 online
    this.classSelections = [];
    for (let s = 0; s < squadsCount; s++) {
      this.classSelections.push([...CONFIG.SQUAD.DEFAULTS]);
    }
    this._prepSquadIdx = 0;
    this._squadsCount = squadsCount;
    this._buildPrepScreen();
    this.phase = 'prep';
  }

  showWaitingOverlay(text) {
    if (this._waitingOverlay) this._waitingOverlay.remove();
    this._waitingOverlay = document.createElement('div');
    this._waitingOverlay.id = 'waiting-overlay';
    this._waitingOverlay.innerHTML = `<div class="waiting-text">${text}</div>`;
    document.body.appendChild(this._waitingOverlay);
  }

  hideWaitingOverlay() {
    if (this._waitingOverlay) { this._waitingOverlay.remove(); this._waitingOverlay = null; }
  }

  showDisconnectOverlay(onBack) {
    if (this._disconnectOverlay) this._disconnectOverlay.remove();
    this._disconnectOverlay = document.createElement('div');
    this._disconnectOverlay.id = 'disconnect-overlay';
    const text = document.createElement('div');
    text.className = 'waiting-text';
    text.textContent = 'Opponent disconnected';
    const btn = document.createElement('button');
    btn.id = 'disconnect-back-btn';
    btn.textContent = 'RETURN TO MENU';
    btn.addEventListener('click', () => {
      this._disconnectOverlay.remove();
      this._disconnectOverlay = null;
      onBack();
    });
    this._disconnectOverlay.appendChild(text);
    this._disconnectOverlay.appendChild(btn);
    document.body.appendChild(this._disconnectOverlay);
  }

  hideDisconnectOverlay() {
    if (this._disconnectOverlay) { this._disconnectOverlay.remove(); this._disconnectOverlay = null; }
  }

  _selectMode(mode) {
    this.gameMode = mode;
    this.modeOverlay.classList.add('hidden');

    const squadsCount = mode === 'skirmish' ? 1 : CONFIG.SQUAD.SQUADS_PER_TEAM;
    this.classSelections = [];
    for (let s = 0; s < squadsCount; s++) {
      this.classSelections.push([...CONFIG.SQUAD.DEFAULTS]);
    }
    this._prepSquadIdx = 0;
    this._squadsCount = squadsCount;
    this._buildPrepScreen();
    this.phase = 'prep';
  }

  // ── Prep screen ──
  _buildPrepScreen() {
    if (this.prepOverlay) this.prepOverlay.remove();
    this.prepOverlay = document.createElement('div');
    this.prepOverlay.id = 'prep-overlay';

    const panel = document.createElement('div');
    panel.id = 'prep-panel';

    const title = document.createElement('div');
    title.id = 'prep-title';
    title.textContent = this.gameMode === 'skirmish' ? 'SQUAD LOADOUT — 6v6' : 'SQUAD LOADOUT — 30v30';
    panel.appendChild(title);

    // Squad tabs (only show for battle mode)
    if (this._squadsCount > 1) {
      const tabBar = document.createElement('div');
      tabBar.className = 'prep-tabs';
      this._prepTabs = [];
      for (let s = 0; s < this._squadsCount; s++) {
        const tab = document.createElement('button');
        tab.className = 'prep-tab' + (s === 0 ? ' active' : '');
        tab.textContent = `Squad ${s + 1}`;
        tab.addEventListener('click', () => this._switchPrepSquad(s));
        tabBar.appendChild(tab);
        this._prepTabs.push(tab);
      }
      panel.appendChild(tabBar);
    } else {
      this._prepTabs = [];
    }

    this._prepGrid = document.createElement('div');
    this._prepGrid.id = 'prep-grid';
    this._buildPrepSlots();
    panel.appendChild(this._prepGrid);

    const startBtn = document.createElement('button');
    startBtn.id = 'prep-start-btn';
    startBtn.textContent = this._squadsCount > 1 ? 'DEPLOY ALL SQUADS' : 'DEPLOY SQUAD';
    startBtn.addEventListener('click', () => {
      if (this.gameMode === 'online') {
        Net.sendReady(this.classSelections);
        this.showWaitingOverlay('Waiting for opponent to deploy...');
        Net.on('game_start', (msg) => {
          this.hideWaitingOverlay();
          this.phase = 'play';
          this.prepOverlay.classList.add('hidden');
          if (this._onOnlineStart) this._onOnlineStart(this.classSelections, msg);
        });
      } else {
        this.phase = 'play';
        this.prepOverlay.classList.add('hidden');
        if (this._onStart) this._onStart(this.classSelections, this.gameMode);
      }
    });
    panel.appendChild(startBtn);

    this.prepOverlay.appendChild(panel);
    document.body.appendChild(this.prepOverlay);
  }

  _buildPrepSlots() {
    this._prepGrid.innerHTML = '';
    this._prepSlots = [];
    const sq = this._prepSquadIdx;
    for (let i = 0; i < CONFIG.SQUAD.SQUAD_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'prep-slot';
      const label = document.createElement('div');
      label.className = 'prep-slot-label';
      label.textContent = i === 0 ? `Unit ${i + 1} (Leader)` : `Unit ${i + 1}`;
      const btnRow = document.createElement('div');
      btnRow.className = 'prep-btn-row';
      for (const key of Object.keys(CONFIG.CLASSES)) {
        if (this.gameMode === 'online' && key === 'brawler') continue; // singleplayer only
        const def = CONFIG.CLASSES[key];
        const btn = document.createElement('button');
        btn.className = 'prep-class-btn' + (this.classSelections[sq][i] === key ? ' active' : '');
        btn.style.borderColor = def.color;
        btn.innerHTML = `<span style="color:${def.color}">${def.icon}</span> ${def.name}`;
        btn.addEventListener('click', () => {
          this.classSelections[sq][i] = key;
          this._buildPrepSlots();
        });
        btnRow.appendChild(btn);
      }
      const desc = document.createElement('div');
      desc.className = 'prep-slot-desc';
      desc.textContent = CONFIG.CLASSES[this.classSelections[sq][i]].desc;
      slot.appendChild(label); slot.appendChild(btnRow); slot.appendChild(desc);
      this._prepGrid.appendChild(slot);
      this._prepSlots.push(slot);
    }
  }

  _switchPrepSquad(idx) {
    this._prepSquadIdx = idx;
    for (let i = 0; i < this._prepTabs.length; i++) {
      this._prepTabs[i].classList.toggle('active', i === idx);
    }
    this._buildPrepSlots();
  }

  // ── In-game HUD ──
  _buildHUD() {
    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    this.hud.style.display = 'none';

    this._hudSquadBar = document.createElement('div');
    this._hudSquadBar.id = 'hud-squad-bar';
    this._hudSquadTabs = [];
    this.hud.appendChild(this._hudSquadBar);

    this._portraitContainer = document.createElement('div');
    this._portraitContainer.id = 'portrait-row';
    this.portraits = [];
    for (let i = 0; i < CONFIG.SQUAD.SQUAD_SIZE; i++) {
      const p = document.createElement('div');
      p.className = 'portrait';
      const num = document.createElement('span');
      num.className = 'portrait-num';
      num.textContent = i + 1;
      const classIcon = document.createElement('span');
      classIcon.className = 'portrait-class';
      const hp = document.createElement('div');
      hp.className = 'portrait-hp';
      const hpFill = document.createElement('div');
      hpFill.className = 'portrait-hp-fill';
      hp.appendChild(hpFill);
      const info = document.createElement('div');
      info.className = 'portrait-info';
      const statusEl = document.createElement('div');
      statusEl.className = 'portrait-status';
      p.appendChild(num); p.appendChild(classIcon); p.appendChild(hp);
      p.appendChild(info); p.appendChild(statusEl);
      this._portraitContainer.appendChild(p);
      this.portraits.push({ el: p, hpFill, info, statusEl, classIcon });
    }
    this.hud.appendChild(this._portraitContainer);
    document.body.appendChild(this.hud);

    this.statusDisplay = document.createElement('div');
    this.statusDisplay.id = 'status-display';
    this.statusDisplay.style.display = 'none';
    document.body.appendChild(this.statusDisplay);

    this.groupIndicator = document.createElement('div');
    this.groupIndicator.id = 'group-indicator';
    this.groupIndicator.className = 'hidden';
    this.groupIndicator.textContent = 'SQUAD GROUPED [G]';
    document.body.appendChild(this.groupIndicator);

    this.controlsHint = document.createElement('div');
    this.controlsHint.id = 'controls-hint';
    this.controlsHint.style.display = 'none';
    this.controlsHint.innerHTML = 'WASD: move | Click: shoot | R: reload | V: melee | E: ability | 1-6: unit | Tab: squad | P: spectate | G: group | Q: medkit | F: loot';
    document.body.appendChild(this.controlsHint);
  }

  showGameHUD(squadsCount) {
    // Build squad tabs for HUD
    this._hudSquadBar.innerHTML = '';
    this._hudSquadTabs = [];
    if (squadsCount > 1) {
      for (let s = 0; s < squadsCount; s++) {
        const tab = document.createElement('div');
        tab.className = 'hud-squad-tab';
        tab.textContent = s + 1;
        this._hudSquadBar.appendChild(tab);
        this._hudSquadTabs.push(tab);
      }
    }
    this.hud.style.display = '';
    this.statusDisplay.style.display = '';
    this.controlsHint.style.display = '';
  }

  update(playerArmy, enemyArmy, currentSquadIdx, selectedUnit, grouped) {
    const squad = playerArmy.squads[currentSquadIdx];
    if (!squad) return;

    for (let s = 0; s < this._hudSquadTabs.length; s++) {
      const tab = this._hudSquadTabs[s];
      tab.classList.toggle('active', s === currentSquadIdx);
      const sq = playerArmy.squads[s];
      tab.classList.toggle('dead', sq && sq.allDead);
    }

    for (let i = 0; i < CONFIG.SQUAD.SQUAD_SIZE; i++) {
      const unit = squad.units[i];
      const p = this.portraits[i];
      p.el.classList.toggle('selected', i === selectedUnit);
      p.el.classList.toggle('dead', unit.dead);
      p.el.classList.toggle('leader', unit.isLeader);

      const def = CONFIG.CLASSES[unit.className];
      p.classIcon.textContent = def ? def.icon : '?';
      p.classIcon.style.color = def ? def.color : '#888';

      if (unit.dead) {
        p.hpFill.style.width = '0%';
        p.info.textContent = 'KIA';
        p.statusEl.textContent = '';
      } else {
        p.hpFill.style.width = (unit.hp / unit.maxHp * 100) + '%';
        let infoText;
        if (unit.reloading) infoText = 'RELOAD';
        else {
          infoText = `${unit.ammo}/${unit.reserve}`;
          if (unit.medkits > 0) infoText += ` +${unit.medkits}`;
          if (unit.grenades > 0) infoText += ` G${unit.grenades}`;
        }
        p.info.textContent = infoText;
        p.statusEl.textContent = unit._aiStatus || '';
      }
    }

    const pa = playerArmy.alive.length, ea = enemyArmy.alive.length;
    const total = playerArmy.squads.length * CONFIG.SQUAD.SQUAD_SIZE;
    let modeText = selectedUnit >= 0 ? (playerArmy.squads.length > 1 ? ` | Sq${currentSquadIdx + 1}` : '') : ' | SPECTATING';
    this.statusDisplay.textContent = `Team ${pa}/${total} | Enemy ${ea}/${total}${modeText}`;

    this.groupIndicator.classList.toggle('hidden', !grouped);
  }
}
