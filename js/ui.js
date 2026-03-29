class UI {
  constructor(onStart) {
    this._onStart = onStart;
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

    btnRow.appendChild(skirmishBtn);
    btnRow.appendChild(battleBtn);
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
      this.phase = 'play';
      this.prepOverlay.classList.add('hidden');
      if (this._onStart) this._onStart(this.classSelections, this.gameMode);
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
