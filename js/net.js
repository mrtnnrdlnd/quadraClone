class NetManager {
  constructor(engine) {
    this.engine = engine;
    this.pc = null;
    this.dc = null;
    this.localCandidates = [];
    this.remoteCandidates = [];
    this._isOpen = false;
    this._isHost = false;

    if (this.engine) this.engine.net = this;

    this._ensureQRLibsPromise = null;
    this._createUI();
  }

  _createUI() {
    if (document.getElementById('netPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'netPanel';
    panel.style.position = 'fixed';
    panel.style.right = '12px';
    panel.style.top = '12px';
    panel.style.width = '360px';
    panel.style.maxWidth = 'calc(100% - 24px)';
    panel.style.background = 'rgba(20,20,20,0.95)';
    panel.style.border = '1px solid #333';
    panel.style.padding = '10px';
    panel.style.zIndex = '100001';
    panel.style.color = '#ddd';
    panel.style.fontSize = '13px';
    panel.style.fontFamily = 'sans-serif';
    panel.style.borderRadius = '6px';
    panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.6)';

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>Multiplayer (WebRTC - manual)</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <span id="netStatus" style="font-size:12px;color:#9bd;">Disconnected</span>
          <button id="netClose" style="background:#111;border:1px solid #444;color:#ddd;padding:4px 6px;border-radius:4px;">✕</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:6px;">
        <button id="createOffer" style="flex:1;background:#0a6;border:1px solid #074;color:#022;padding:6px;border-radius:4px;">Create Offer (Host)</button>
        <button id="createAnswer" style="flex:1;background:#08c;border:1px solid #035;color:#022;padding:6px;border-radius:4px;">Create Answer (Join)</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:6px;">
        <button id="applyRemote" style="flex:1;background:#444;border:1px solid #222;color:#ddd;padding:6px;border-radius:4px;">Apply Remote SDP</button>
        <button id="copyLocal" style="flex:1;background:#333;border:1px solid #222;color:#ddd;padding:6px;border-radius:4px;">Copy Local</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:6px;">
        <button id="showQR" style="flex:1;background:#666;border:1px solid #444;color:#ddd;padding:6px;border-radius:4px;">Show QR</button>
        <button id="scanQR" style="flex:1;background:#555;border:1px solid #333;color:#ddd;padding:6px;border-radius:4px;">Scan Remote QR</button>
      </div>
      <div style="margin-bottom:6px;">Local signal (share this with peer once created)</div>
      <textarea id="localSignal" readonly style="width:100%;height:90px;background:#0f0f10;color:#ddd;border:1px solid #222;padding:6px;border-radius:4px;resize:vertical;"></textarea>
      <div id="localQRContainer" style="display:none;margin-top:8px;text-align:center;">
        <div id="localQR" style="display:inline-block;background:#fff;padding:6px;border-radius:6px;">&nbsp;</div>
      </div>
      <div style="margin:8px 0 6px 0;">Remote signal (paste peer's offer/answer here and click Apply) or scan QR</div>
      <textarea id="remoteSignal" style="width:100%;height:90px;background:#0f0f10;color:#ddd;border:1px solid #222;padding:6px;border-radius:4px;resize:vertical;"></textarea>
      <div style="margin-top:8px;font-size:12px;color:#999;">Instructions: Host -> Create Offer -> copy Local or show QR -> share with peer. Peer pastes/scans into Remote and clicks Create Answer -> copy Local back to host or show QR. Host pastes that into Remote and clicks Apply Remote SDP.</div>
    `;

    document.body.appendChild(panel);

    this.ui = {
      panel,
      status: panel.querySelector('#netStatus'),
      localSignal: panel.querySelector('#localSignal'),
      remoteSignal: panel.querySelector('#remoteSignal'),
      btnOffer: panel.querySelector('#createOffer'),
      btnAnswer: panel.querySelector('#createAnswer'),
      btnApply: panel.querySelector('#applyRemote'),
      btnCopy: panel.querySelector('#copyLocal'),
      btnClose: panel.querySelector('#netClose'),
      btnShowQR: panel.querySelector('#showQR'),
      btnScanQR: panel.querySelector('#scanQR'),
      localQRContainer: panel.querySelector('#localQRContainer'),
      localQR: panel.querySelector('#localQR')
    };

    this.ui.btnOffer.addEventListener('click', () => this._onCreateOffer());
    this.ui.btnAnswer.addEventListener('click', () => this._onCreateAnswer());
    this.ui.btnApply.addEventListener('click', () => this._onApplyRemote());
    this.ui.btnCopy.addEventListener('click', () => this._onCopyLocal());
    this.ui.btnClose.addEventListener('click', () => { panel.remove(); });
    this.ui.btnShowQR.addEventListener('click', () => this._toggleShowQR());
    this.ui.btnScanQR.addEventListener('click', () => this._startScan());
  }

  _setStatus(txt) {
    if (this.ui && this.ui.status) this.ui.status.innerText = txt;
  }

  async _onCreateOffer() {
    try {
      await this._createPeer(true);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      // Wait for ICE gathering to complete
      await this._waitForIceGatheringComplete();
      const signal = { desc: this.pc.localDescription ? this.pc.localDescription.toJSON() : offer.toJSON(), candidates: this.localCandidates };
      if (this.ui && this.ui.localSignal) this.ui.localSignal.value = JSON.stringify(signal);
      this._isHost = true;
      this._setStatus('Offer ready (waiting for answer)');
      this._updateLocalQR();
    } catch (e) {
      console.warn('Offer creation failed', e);
      this._setStatus('Offer failed');
    }
  }

  async _onCreateAnswer() {
    // The remoteSignal textarea should contain the offer from the host
    const text = this.ui.remoteSignal.value.trim();
    if (!text) { this._setStatus('Paste remote offer first'); return; }
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) { this._setStatus('Invalid JSON'); return; }

    try {
      await this._createPeer(false);
      // set remote desc (offer)
      await this.pc.setRemoteDescription(obj.desc);
      // add any provided ICE candidates
      if (Array.isArray(obj.candidates)) {
        for (let c of obj.candidates) {
          try { await this.pc.addIceCandidate(c); } catch (e) { /* ignore */ }
        }
      }

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this._waitForIceGatheringComplete();
      const signal = { desc: this.pc.localDescription ? this.pc.localDescription.toJSON() : answer.toJSON(), candidates: this.localCandidates };
      if (this.ui && this.ui.localSignal) this.ui.localSignal.value = JSON.stringify(signal);
      this._setStatus('Answer ready - send to host');
      this._updateLocalQR();
    } catch (e) {
      console.warn('Answer creation failed', e);
      this._setStatus('Answer failed');
    }
  }

  async _onApplyRemote() {
    const text = this.ui.remoteSignal.value.trim();
    if (!text) { this._setStatus('Paste remote SDP first'); return; }
    let obj;
    try { obj = JSON.parse(text); } catch (e) { this._setStatus('Invalid JSON'); return; }
    try {
      if (!this.pc) {
        // If there's no pc yet, create one (act as answerer if remote is offer)
        await this._createPeer(false);
      }
      await this.pc.setRemoteDescription(obj.desc);
      if (Array.isArray(obj.candidates)) {
        for (let c of obj.candidates) {
          try { await this.pc.addIceCandidate(c); } catch (e) { /* ignore */ }
        }
      }
      this._setStatus('Remote SDP applied');
    } catch (e) {
      console.warn('Applying remote SDP failed', e);
      this._setStatus('Apply failed');
    }
  }

  async _onCopyLocal() {
    if (!this.ui || !this.ui.localSignal) return;
    const txt = this.ui.localSignal.value;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        this._setStatus('Local signal copied');
      } else {
        this.ui.localSignal.select();
        document.execCommand('copy');
        this._setStatus('Local copied');
      }
    } catch (e) {
      this._setStatus('Copy failed');
    }
  }

  async _createPeer(isHost) {
    if (this.pc) return;
    const cfg = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    this.pc = new RTCPeerConnection(cfg);
    this._isHost = !!isHost;
    this.localCandidates = [];

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        try { this.localCandidates.push(e.candidate.toJSON()); } catch (ex) { }
      } else {
        // Gathering finished
        if (this.ui && this.ui.localSignal && this.pc && this.pc.localDescription) {
          const s = { desc: this.pc.localDescription.toJSON(), candidates: this.localCandidates };
          this.ui.localSignal.value = JSON.stringify(s);
          this._updateLocalQR();
        }
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc ? this.pc.iceConnectionState : 'closed';
      this._setStatus(`ICE: ${s}`);
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc ? this.pc.connectionState : 'closed';
      this._setStatus(`Conn: ${s}`);
    };

    if (isHost) {
      // create data channel proactively
      this.dc = this.pc.createDataChannel('game');
      this._setupDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.dc = ev.channel;
        this._setupDataChannel(this.dc);
      };
    }
  }

  _setupDataChannel(dc) {
    dc.onopen = () => {
      this._isOpen = true;
      this._setStatus('Connected');
    };
    dc.onclose = () => {
      this._isOpen = false;
      this._setStatus('Disconnected');
    };
    dc.onerror = (e) => {
      console.warn('DataChannel error', e);
    };
    dc.onmessage = (ev) => {
      this._handleMessage(ev.data);
    };
  }

  async _waitForIceGatheringComplete(timeout = 5000) {
    if (!this.pc) return;
    if (this.pc.iceGatheringState === 'complete') return;
    return new Promise((resolve) => {
      const check = () => {
        if (!this.pc) return resolve();
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', check);
      // Fallback timeout
      setTimeout(() => resolve(), timeout);
    });
  }

  _handleMessage(raw) {
    let msg = null;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.type) return;
    if (msg.type === 'garbage') {
      const cnt = parseInt(msg.count, 10) || 0;
      if (this.engine && typeof this.engine.addGarbage === 'function') {
        this.engine.addGarbage(cnt);
      }
    }
    // future message types: state updates, ping, chat, etc.
  }

  send(obj) {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    try {
      this.dc.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  isOpen() {
    return !!(this.dc && this.dc.readyState === 'open');
  }

  // QR helpers: load libraries, update QR for local signal, scanning
  _ensureQRLibs() {
    if (this._ensureQRLibsPromise) return this._ensureQRLibsPromise;
    this._ensureQRLibsPromise = new Promise((resolve) => {
      const libs = [];
      // qrcodejs (creates window.QRCode)
      if (!window.QRCode) libs.push('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
      // jsQR (decoder) - used for scanning
      if (!window.jsQR) libs.push('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');

      if (libs.length === 0) return resolve(true);

      let loaded = 0;
      libs.forEach(src => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { loaded++; if (loaded === libs.length) resolve(true); };
        s.onerror = () => { loaded++; if (loaded === libs.length) resolve(true); };
        document.head.appendChild(s);
      });
    });
    return this._ensureQRLibsPromise;
  }

  async _updateLocalQR() {
    if (!this.ui) return;
    const text = this.ui.localSignal.value || '';
    if (!text) {
      this.ui.localQRContainer.style.display = 'none';
      return;
    }
    // ensure libs loaded
    await this._ensureQRLibs();
    this.ui.localQRContainer.style.display = '';
    // clear previous
    this.ui.localQR.innerHTML = '';
    try {
      if (window.QRCode) {
        // QRCode(element, options) - qrcodejs
        new QRCode(this.ui.localQR, { text: text, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
      } else if (window.QRCode && typeof window.QRCode.toCanvas === 'function') {
        // fallback for other libs
        await window.QRCode.toCanvas(this.ui.localQR, text, { width: 220 });
      } else {
        // Fallback: show text inside box
        const pre = document.createElement('pre'); pre.style.whiteSpace = 'normal'; pre.style.color = '#000'; pre.style.maxWidth = '200px'; pre.innerText = text.substring(0, 800);
        this.ui.localQR.appendChild(pre);
      }
    } catch (e) {
      // If generation fails, fallback to showing text
      const pre = document.createElement('pre'); pre.style.whiteSpace = 'normal'; pre.style.color = '#000'; pre.style.maxWidth = '200px'; pre.innerText = text.substring(0, 800);
      this.ui.localQR.appendChild(pre);
    }
  }

  _toggleShowQR() {
    if (!this.ui) return;
    if (this.ui.localQRContainer.style.display === 'none' || this.ui.localQRContainer.style.display === '') {
      // show
      this._updateLocalQR();
    } else {
      this.ui.localQRContainer.style.display = 'none';
    }
  }

  async _startScan() {
    // Start camera and attempt to decode QR codes into remoteSignal textarea
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera not available on this device or permission denied. Use paste instead.');
      return;
    }

    await this._ensureQRLibs();

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.85)'; overlay.style.zIndex = '200000'; overlay.style.display = 'flex'; overlay.style.flexDirection = 'column'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';

    const info = document.createElement('div'); info.style.color = '#fff'; info.style.marginBottom = '8px'; info.innerText = 'Point camera at QR code';
    const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.style.maxWidth = '90%'; video.style.border = '4px solid rgba(255,255,255,0.06)'; video.style.borderRadius = '8px';
    const stopBtn = document.createElement('button'); stopBtn.innerText = 'Stop scanning'; stopBtn.style.marginTop = '12px'; stopBtn.style.padding = '8px 12px'; stopBtn.style.borderRadius = '6px';

    overlay.appendChild(info); overlay.appendChild(video); overlay.appendChild(stopBtn);
    document.body.appendChild(overlay);

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
    } catch (e) {
      console.warn('Camera error', e);
      alert('Unable to access camera: ' + (e && e.message ? e.message : ''));
      overlay.remove();
      if (stream) { stream.getTracks().forEach(t => t.stop()); }
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let stop = false;

    const cleanup = () => {
      stop = true;
      try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      overlay.remove();
    };

    stopBtn.addEventListener('click', () => { cleanup(); });

    const tick = () => {
      if (stop) return;
      try {
        const vw = video.videoWidth; const vh = video.videoHeight;
        if (vw && vh) {
          const scale = Math.min(640 / vw, 480 / vh, 1);
          const w = Math.floor(vw * scale); const h = Math.floor(vh * scale);
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          if (window.jsQR) {
            try {
              const imageData = ctx.getImageData(0, 0, w, h);
              const code = window.jsQR(imageData.data, imageData.width, imageData.height);
              if (code && code.data) {
                // Found QR code
                if (this.ui && this.ui.remoteSignal) this.ui.remoteSignal.value = code.data;
                this._setStatus('QR decoded');
                // Auto apply
                try { this._onApplyRemote(); } catch (e) {}
                cleanup();
                return;
              }
            } catch (ex) { /* ignore frame decoding errors */ }
          }
        }
      } catch (ex) { /* ignore draw errors */ }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// expose globally
window.NetManager = NetManager;
