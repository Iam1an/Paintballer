class UI {
  constructor(onStart, onOnlineStart) {
    this._onStart = onStart;
    this._onOnlineStart = onOnlineStart;
    this.phase = 'mode_select';
    this.gameMode = null; // 'skirmish' (6v6) or 'battle' (30v30)
    this._parallaxBgs = new Map(); // Track parallax backgrounds by overlay ID
    this._mouseMoveListener = (e) => this._handleMouseMove(e);
    this._buildTopBar();
    this._buildModeSelect();
    this._buildHUD();
  }

  // ── Top bar (shared) ──
  _buildTopBar() {
    this.topBar = document.createElement('div');
    this.topBar.className = 'mode-top-bar';

    this.backBtn = document.createElement('button');
    this.backBtn.className = 'mode-btn icon-btn hidden';
    this.backBtn.innerHTML = '⟵';
    this.backBtn.title = 'Back';
    this.backBtn.addEventListener('click', () => {
      if (this.backAction) this.backAction();
    });
    this._addSplatSoundToButton(this.backBtn);
    this.topBar.appendChild(this.backBtn);

    this.fsBtn = document.createElement('button');
    this.fsBtn.className = 'mode-btn icon-btn';
    this.fsBtn.innerHTML = '⛶';
    this.fsBtn.title = 'Fullscreen';
    this.fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
    this._addSplatSoundToButton(this.fsBtn);
    this.topBar.appendChild(this.fsBtn);

    document.body.appendChild(this.topBar);
  }

  _setBackAction(action) {
    this.backAction = action;
    if (action) {
      this.backBtn.classList.remove('hidden');
    } else {
      this.backBtn.classList.add('hidden');
    }
  }

  // ── Parallax Background System ──
  _generatePaintSplat(baseColor, size) {
    // Convert color name to actual color value
    const colorMap = {
      red: '#ff4444',
      blue: '#4488ff',
      green: '#44ff44',
      yellow: '#ffff44',
      purple: '#ff44ff',
      cyan: '#44ffff'
    };
    const color = colorMap[baseColor] || '#44ff44';
    
    // Create splat shape using SVG with organic irregular edges
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    
    // Main splat blob
    const mainBlob = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    mainBlob.setAttribute('cx', '50');
    mainBlob.setAttribute('cy', '50');
    mainBlob.setAttribute('r', '40');
    mainBlob.setAttribute('fill', color);
    mainBlob.setAttribute('opacity', '0.8');
    svg.appendChild(mainBlob);
    
    // Add random splatters and drips
    for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) {
      const splatter = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const angle = Math.random() * Math.PI * 2;
      const distance = 35 + Math.random() * 25;
      const cx = 50 + Math.cos(angle) * distance;
      const cy = 50 + Math.sin(angle) * distance;
      const r = 8 + Math.random() * 12;
      
      splatter.setAttribute('cx', cx);
      splatter.setAttribute('cy', cy);
      splatter.setAttribute('r', r);
      splatter.setAttribute('fill', color);
      splatter.setAttribute('opacity', 0.5 + Math.random() * 0.4);
      svg.appendChild(splatter);
    }
    
    return svg;
  }

  _createParallaxBackground(overlayId) {
    // Create parallax container
    const parallaxBg = document.createElement('div');
    parallaxBg.className = 'parallax-bg';
    parallaxBg.id = `parallax-${overlayId}`;

    // Create three parallax layers
    const layerFar = document.createElement('div');
    layerFar.className = 'parallax-layer parallax-layer-far';
    parallaxBg.appendChild(layerFar);

    const layerMid = document.createElement('div');
    layerMid.className = 'parallax-layer parallax-layer-mid';
    parallaxBg.appendChild(layerMid);

    const layerNear = document.createElement('div');
    layerNear.className = 'parallax-layer parallax-layer-near';
    parallaxBg.appendChild(layerNear);

    // Generate random paint splats
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan'];
    const splatCount = 18 + Math.floor(Math.random() * 12);

    for (let i = 0; i < splatCount; i++) {
      const splat = document.createElement('div');
      splat.className = 'paint-splat';
      
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 30 + Math.random() * 90;

      // Random position - spread across entire screen
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      splat.style.left = x + '%';
      splat.style.top = y + '%';
      splat.style.width = size + 'px';
      splat.style.height = size + 'px';
      splat.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;

      // Random opacity (0.4 - 0.85)
      splat.style.opacity = 0.4 + Math.random() * 0.45;

      // Generate SVG splat and add to div
      const splatSvg = this._generatePaintSplat(color, size);
      splat.appendChild(splatSvg);

      // Random layer assignment
      const layerChoice = Math.random();
      if (layerChoice < 0.4) {
        layerFar.appendChild(splat);
      } else if (layerChoice < 0.7) {
        layerMid.appendChild(splat);
      } else {
        layerNear.appendChild(splat);
      }
    }

    // Store parallax info
    this._parallaxBgs.set(overlayId, {
      element: parallaxBg,
      layers: [layerFar, layerMid, layerNear],
      overlayId: overlayId
    });

    return parallaxBg;
  }

  _attachParallaxToOverlay(overlay, overlayId) {
    const parallaxBg = this._createParallaxBackground(overlayId);
    overlay.appendChild(parallaxBg);

    // Only add mouse move listener if not already added
    if (!this._mouseListenerActive) {
      document.addEventListener('mousemove', this._mouseMoveListener);
      this._mouseListenerActive = true;
    }
  }

  _handleMouseMove(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = (e.clientY / window.innerHeight) * 2 - 1;

    // Apply parallax effect to all visible backgrounds
    for (const [id, bgInfo] of this._parallaxBgs.entries()) {
      const overlay = document.getElementById(id);
      if (overlay && !overlay.classList.contains('hidden')) {
        const depthMultipliers = [8, 5, 2]; // Different depths for each layer
        bgInfo.layers.forEach((layer, i) => {
          const offsetX = x * depthMultipliers[i];
          const offsetY = y * depthMultipliers[i];
          layer.style.transform = `translate(${offsetX * 2}px, ${offsetY * 2}px)`;
        });
      }
    }
  }

  _removeParallaxBackground(overlayId) {
    if (this._parallaxBgs.has(overlayId)) {
      const element = this._parallaxBgs.get(overlayId).element;
      element.remove();
      this._parallaxBgs.delete(overlayId);
    }

    // Remove listener if no more backgrounds active
    if (this._parallaxBgs.size === 0 && this._mouseListenerActive) {
      document.removeEventListener('mousemove', this._mouseMoveListener);
      this._mouseListenerActive = false;
    }
  }

  _addSplatSoundToButton(button) {
    button.addEventListener('click', () => {
      Audio.splat();
    });
  }

  // ── Mode select screen ──
  _buildModeSelect() {

    this.modeOverlay = document.createElement('div');
    this.modeOverlay.id = 'mode-overlay';

    const panel = document.createElement('div');
    panel.id = 'mode-panel';

    const appTitle = document.createElement('div');
    appTitle.id = 'app-title';
    appTitle.textContent = 'PaintBaller';
    panel.appendChild(appTitle);

    const title = document.createElement('div');
    title.id = 'mode-title';
    title.textContent = 'SELECT MODE';
    panel.appendChild(title);

    // Main mode selection (Singleplayer / Multiplayer)
    this.mainModeContainer = document.createElement('div');
    this.mainModeContainer.className = 'mode-btn-row';

    const singleplayerBtn = document.createElement('button');
    singleplayerBtn.className = 'mode-btn';
    singleplayerBtn.innerHTML = '<div class="mode-btn-title">SINGLEPLAYER</div><div class="mode-btn-desc">Training & Campaign</div>';
    singleplayerBtn.addEventListener('click', () => this._showSingleplayerOptions());
    this._addSplatSoundToButton(singleplayerBtn);
    this.mainModeContainer.appendChild(singleplayerBtn);

    const multiplayerBtn = document.createElement('button');
    multiplayerBtn.className = 'mode-btn';
    multiplayerBtn.innerHTML = '<div class="mode-btn-title">MULTIPLAYER</div><div class="mode-btn-desc">Online only</div>';
    multiplayerBtn.addEventListener('click', () => this._showLobby());
    this._addSplatSoundToButton(multiplayerBtn);
    this.mainModeContainer.appendChild(multiplayerBtn);

    panel.appendChild(this.mainModeContainer);

    // Singleplayer submenu (Training / Campaign)
    this.spOptionsContainer = document.createElement('div');
    this.spOptionsContainer.className = 'mode-btn-row hidden';

    const trainingBtn = document.createElement('button');
    trainingBtn.className = 'mode-btn';
    trainingBtn.innerHTML = '<div class="mode-btn-title">TRAINING</div><div class="mode-btn-desc">Learn the basics</div>';
    trainingBtn.addEventListener('click', () => this._selectMode('training'));
    this._addSplatSoundToButton(trainingBtn);
    this.spOptionsContainer.appendChild(trainingBtn);

    const campaignBtn = document.createElement('button');
    campaignBtn.className = 'mode-btn';
    campaignBtn.innerHTML = '<div class="mode-btn-title">CAMPAIGN</div><div class="mode-btn-desc">Story missions</div>';
    campaignBtn.addEventListener('click', () => this._selectMode('campaign'));
    this._addSplatSoundToButton(campaignBtn);
    this.spOptionsContainer.appendChild(campaignBtn);

    panel.appendChild(this.spOptionsContainer);

    this.modeOverlay.appendChild(panel);
    
    // Add parallax background
    this._attachParallaxToOverlay(this.modeOverlay, 'mode-overlay');
    
    document.body.appendChild(this.modeOverlay);
  }

  _showSingleplayerOptions() {
    this.mainModeContainer.classList.add('hidden');
    this.spOptionsContainer.classList.remove('hidden');
    this._setBackAction(() => this._showMainModeSelect());
  }

  _showMainModeSelect() {
    // If we are in prep, close it and return to the mode overlay
    if (this.prepOverlay) {
      this._removeParallaxBackground('prep-overlay');
      this.prepOverlay.remove();
      this.prepOverlay = null;
    }

    if (this.lobbyOverlay) {
      this.lobbyOverlay.remove();
      this.lobbyOverlay = null;
    }

    if (this.modeOverlay) {
      this.modeOverlay.classList.remove('hidden');
    }

    this.spOptionsContainer.classList.add('hidden');
    this.mainModeContainer.classList.remove('hidden');
    this.phase = 'mode_select';
    this._setBackAction(null);
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
    this._addSplatSoundToButton(createBtn);
    panel.appendChild(createBtn);

    // Browse lobbies
    const browseBtn = document.createElement('button');
    browseBtn.className = 'mode-btn';
    browseBtn.innerHTML = '<div class="mode-btn-title">BROWSE LOBBIES</div><div class="mode-btn-desc">Find games waiting for opponents</div>';
    browseBtn.addEventListener('click', () => this._showLobbies());
    this._addSplatSoundToButton(browseBtn);
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
    this._addSplatSoundToButton(joinBtn);
    joinRow.appendChild(this._joinInput);
    joinRow.appendChild(joinBtn);
    panel.appendChild(joinRow);

    // Status area
    this._lobbyStatus = document.createElement('div');
    this._lobbyStatus.id = 'lobby-status';
    panel.appendChild(this._lobbyStatus);

    this.lobbyOverlay.appendChild(panel);
    
    // Add parallax background
    this._attachParallaxToOverlay(this.lobbyOverlay, 'lobby-overlay');
    
    document.body.appendChild(this.lobbyOverlay);

    this._setBackAction(() => {
      Net.disconnect();
      this._removeParallaxBackground('lobby-overlay');
      if (this.lobbyOverlay) {
        this.lobbyOverlay.remove();
        this.lobbyOverlay = null;
      }
      this.modeOverlay.classList.remove('hidden');
      this.phase = 'mode_select';
      this._showMainModeSelect();
    });
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
        this._addSplatSoundToButton(joinBtn);
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
    this._addSplatSoundToButton(backBtn);
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
        this._setBackAction(() => this._cancelOnlineWait());
      });
      Net.on('opponent_joined', () => {
        this.hideWaitingOverlay();
        this._setBackAction(null);
        this._lobbyStatus.textContent = 'Opponent joined! Setting up...';
        this._startOnlinePrep();
      });
      Net.on('error', (msg) => {
        this.hideWaitingOverlay();
        this._setBackAction(null);
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
        this._setBackAction(null);
        this._startOnlinePrep();
      });
      Net.on('error', (msg) => {
        this.hideWaitingOverlay();
        this._setBackAction(null);
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

  _cancelOnlineWait() {
    this.hideWaitingOverlay();
    this._setBackAction(null);
    Net.disconnect();
    
    // Return to lobby screen
    if (this.prepOverlay) {
      this._removeParallaxBackground('prep-overlay');
      this.prepOverlay.remove();
      this.prepOverlay = null;
    }
    
    this._showLobby();
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
    this._addSplatSoundToButton(btn);
    this._disconnectOverlay.appendChild(text);
    this._disconnectOverlay.appendChild(btn);
    document.body.appendChild(this._disconnectOverlay);
  }

  hideDisconnectOverlay() {
    if (this._disconnectOverlay) { this._disconnectOverlay.remove(); this._disconnectOverlay = null; }
  }

  _selectMode(mode) {
    // Map singleplayer labels to game modes that are supported in game logic
    let effectiveMode = mode;
    if (mode === 'training') effectiveMode = 'skirmish';
    else if (mode === 'campaign') effectiveMode = 'battle';

    this.gameMode = mode;
    this.modeOverlay.classList.add('hidden');

    const squadsCount = effectiveMode === 'skirmish' ? 1 : CONFIG.SQUAD.SQUADS_PER_TEAM;
    this.classSelections = [];
    for (let s = 0; s < squadsCount; s++) {
      this.classSelections.push([...CONFIG.SQUAD.DEFAULTS]);
    }
    this._prepSquadIdx = 0;
    this._squadsCount = squadsCount;
    this._effectiveGameMode = effectiveMode;
    this._buildPrepScreen();
    this.phase = 'prep';
    this._setBackAction(() => this._showMainModeSelect());
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
    const modeTitleMap = {
      training: 'TRAINING — 6v6',
      campaign: 'CAMPAIGN — 30v30',
      skirmish: 'SKIRMISH — 6v6',
      battle: 'BATTLE — 30v30',
      online: 'ONLINE — 6v6'
    };
    title.textContent = modeTitleMap[this.gameMode] || modeTitleMap[this._effectiveGameMode] || 'SQUAD LOADOUT';
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
        this._addSplatSoundToButton(tab);
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
        this._setBackAction(() => this._cancelOnlineWait());
        Net.on('game_start', (msg) => {
          this.hideWaitingOverlay();
          this._setBackAction(null);
          this.phase = 'play';
          this._removeParallaxBackground('prep-overlay');
          this.prepOverlay.classList.add('hidden');
          if (this._onOnlineStart) this._onOnlineStart(this.classSelections, msg);
        });
      } else {
        this.phase = 'play';
        this._removeParallaxBackground('prep-overlay');
        this.prepOverlay.classList.add('hidden');
        if (this._onStart) this._onStart(this.classSelections, this.gameMode);
      }
    });
    this._addSplatSoundToButton(startBtn);
    panel.appendChild(startBtn);

    this.prepOverlay.appendChild(panel);
    
    // Add parallax background
    this._attachParallaxToOverlay(this.prepOverlay, 'prep-overlay');
    
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
        this._addSplatSoundToButton(btn);
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
