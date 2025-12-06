const socket = io();
const $ = id => document.getElementById(id);

// UI Elementleri
const targetBadge = $('targetBadge');
const targetRankDisplay = $('targetRankDisplay');
const bluffOverlay = $('bluffOverlay');
const bluffText = $('bluffText');
const bluffSub = $('bluffSub');
const declaredRankSelector = $('declaredRankSelector'); // Yeni Seçim Kutusu

const playerNameInput = $('playerName');
const btnCreate = $('btnCreate');
const btnJoin = $('btnJoin');
const createRoomName = $('createRoomName');
const createMax = $('createMax');
const joinCode = $('joinCode');
const menuMsg = $('menuMsg');
const playersList = $('playersList');

const roomSection = $('room');
const roomTitle = $('roomTitle');
const roomInfo = $('roomInfo');
const btnStart = $('btnStart');
const btnLeave = $('btnLeave');
const tableScene = $('tableScene');
const seatsContainer = $('seats');
const centerPile = $('centerPile');
const handArea = $('handArea');
const btnPlaySelected = $('btnPlaySelected');
const btnCall = $('btnCall');
const btnNextRound = $('btnNextRound');
const roundNo = $('roundNo');
const msgs = $('msgs');
const tpl = $('cardTpl');

// Oyun Durumu
let myHand = [];
let myId = null;
let playersState = [];
let selectedIndices = new Set();
let currentRoomCode = null;
let roomOwnerId = null;
let currentTargetRank = null; // Masanın hedef sayısı

// Helpers
const showMenuMessage = t => { if (menuMsg) { menuMsg.textContent = t; setTimeout(()=> menuMsg.textContent='',3000); } };
const showMsg = t => { if (!msgs) return; const d = document.createElement('div'); d.textContent = t; msgs.prepend(d); };

// Buton Olayları
if (btnCreate) btnCreate.onclick = () => {
  const name = (createRoomName && createRoomName.value) || '';
  const max = (createMax && Number(createMax.value)) || 4;
  const playerName = (playerNameInput && playerNameInput.value) || 'Anon';
  socket.emit('create_room', { name, maxPlayers: max, playerName }, res => {
    if (!res.ok) return showMenuMessage(res.error || 'Hata');
    enterRoom(res.code);
  });
};
if (btnJoin) btnJoin.onclick = () => {
  const code = (joinCode && joinCode.value || '').trim().toUpperCase();
  if (!code) return showMenuMessage('Kod girin');
  const playerName = (playerNameInput && playerNameInput.value) || 'Anon';
  socket.emit('join_room', { code, playerName }, res => {
    if (!res.ok) return showMenuMessage(res.error || 'Katılamadı');
    enterRoom(code);
  });
};
if (btnLeave) btnLeave.onclick = () => {
  socket.emit('leave_room', null, res => {
    const menuPanel = document.querySelector('.panel');
    if (menuPanel) menuPanel.classList.remove('hidden');
    if (roomSection) roomSection.classList.add('hidden');
    currentRoomCode = null;
    myHand = [];
    playersState = [];
    selectedIndices.clear();
    renderHand();
  });
};
if (btnStart) btnStart.onclick = () => socket.emit('start_game', null, res => {
  if (!res.ok) showMsg('Başlatılamadı: ' + (res.error || ''));
});
if (btnCall) btnCall.onclick = () => socket.emit('call_bluff', null, res => {
  if (!res.ok) showMsg('Hata: ' + (res.error || ''));
});
if (btnNextRound) btnNextRound.onclick = () => socket.emit('next_round', null, res => {
  if (!res.ok) showMsg('Hata: ' + (res.error || ''));
});

function enterRoom(code){
  currentRoomCode = code;
  const menuPanel = document.querySelector('.panel');
  if (menuPanel) menuPanel.classList.add('hidden');
  if (roomSection) roomSection.classList.remove('hidden');
  if (roomTitle) roomTitle.textContent = 'Oda: ' + code;
  if (btnLeave) btnLeave.classList.remove('hidden');
}

// Görünüm Güncelleme (Hedef Seçme Kutusu Kontrolü)
function updateTargetState(target) {
  currentTargetRank = target || null;
  
  if (currentTargetRank) {
    // Hedef belli ise: Badge göster, Seçiciyi gizle
    if (targetRankDisplay) targetRankDisplay.textContent = currentTargetRank;
    if (targetBadge) targetBadge.classList.remove('hidden');
    if (declaredRankSelector) declaredRankSelector.classList.add('hidden');
  } else {
    // Hedef belli değil ise (tur başı): Badge gizle, Seçiciyi göster (Eğer oyun oynanıyorsa)
    if (targetBadge) targetBadge.classList.add('hidden');
    
    // Oyun durumunu kontrol et (Playing mi Lobby mi?)
    const isPlaying = roomInfo && roomInfo.textContent.includes('playing');
    if (isPlaying && declaredRankSelector) {
        declaredRankSelector.classList.remove('hidden');
        declaredRankSelector.value = ""; // Seçimi sıfırla
    }
  }
}

// Socket Olayları
socket.on('connect', () => { myId = socket.id; console.log('connected', myId); });

socket.on('room_update', data => {
  if (!roomInfo) return;
  roomInfo.textContent = `Oda: ${data.name} • ${data.players.length}/${data.maxPlayers} • ${data.state}`;
  playersState = data.players || [];
  roomOwnerId = playersState.length ? playersState[0].id : null;
  renderPlayersList();
  renderSeats();
  if (btnStart) btnStart.disabled = (myId !== roomOwnerId || data.state !== 'lobby');
  
  // Odaya sonradan girenler veya reconnect olanlar için hedefi güncelle
  updateTargetState(data.targetRank);
});

socket.on('game_started', ({ round, targetRank }) => {
  if (roundNo) roundNo.textContent = round;
  showMsg('Oyun başladı!');
  // Oyun başında targetRank NULL gelir. Bu da updateTargetState fonksiyonunda Seçim Kutusunu açar.
  updateTargetState(targetRank); 
});

socket.on('your_hand', hand => {
  myHand = (hand || []).map(h => String(h));
  selectedIndices.clear();
  renderHand();
});

socket.on('table_update', ({ table, lastPlay, target }) => {
  if (!centerPile) return;
  if (!table || table.length === 0) centerPile.textContent = 'ORTAK';
  else centerPile.textContent = `${table.length} kart`;

  if (lastPlay && lastPlay.name) {
      const count = lastPlay.count || 1;
      // Animasyon tetikle
      if (lastPlay.by !== myId) animateRemotePlay(lastPlay.name, count);
      
      showMsg(`${lastPlay.name} ${count} adet ${lastPlay.declared} oynadı.`);
  }

  // Masanın hedefi güncellendi mi?
  updateTargetState(target);
  renderSeats();
});

socket.on('bluff_result', (res) => {
  if (!res) return;
  // Hedef sıfırlandı, yeni tur başlayacak
  if (res.result === 'liar') {
    showBluffOverlay(false, 'YAKALANDI!', `${res.liar} yalan söyledi. (Hedef: ${res.target})`, 2500);
    showMsg(`${res.liar} yalan söyledi!`);
  } else if (res.result === 'truthful') {
    showBluffOverlay(true, 'DOĞRU!', `${res.truthful} doğruydu. (Hedef: ${res.target})`, 2500);
    showMsg(`${res.truthful} doğru söyledi.`);
  }
  renderSeats();
});

socket.on('round_end', ({ winners }) => {
  showMsg('Oyun Bitti! Kazanan: ' + winners.map(w => w.name).join(', '));
  renderSeats();
});

// Kart Oynama Butonu
if (btnPlaySelected) btnPlaySelected.onclick = () => {
  if (selectedIndices.size === 0) return showMsg('Lütfen kart seçin');
  
  const indices = Array.from(selectedIndices).sort((a,b)=>a-b);
  const cards = indices.map(i => myHand[i]);
  
  // HEDEF KONTROLÜ
  let declared = null;
  // Eğer masada hedef yoksa (currentTargetRank null), kullanıcının seçim yapması ZORUNLU
  if (!currentTargetRank) {
      if (!declaredRankSelector.value) {
          return showMsg('Bu elin kaçlı olacağını seçmelisin!');
      }
      declared = declaredRankSelector.value;
  } else {
      declared = currentTargetRank;
  }

  socket.emit('play_cards', { cards, declared }, res => {
    if (!res.ok) showMsg('Hata: ' + (res.error || ''));
    else {
      // Başarılıysa animasyon oynat ve seçimi temizle
      try { animateLocalPlay(indices, cards); } catch(e){}
      selectedIndices.clear();
      if (declaredRankSelector) declaredRankSelector.value = "";
    }
  });
};

// --- RENDER FONKSİYONLARI ---

function renderHand(){
  if (!handArea || !tpl) return;
  handArea.innerHTML = '';
  myHand.forEach((card, idx) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const front = node.querySelector('.front');
    
    // KARTIN ÜZERİNE BÜYÜK RAKAM YAZIYORUZ (Sembol yok)
    front.innerHTML = `<div style="font-size:32px; font-weight:900; color:#333; margin-top:20px;">${card}</div>`;

    node.dataset.index = idx;
    if (selectedIndices.has(idx)) node.classList.add('selected');

    node.addEventListener('click', () => {
      const i = Number(node.dataset.index);
      if (selectedIndices.has(i)) selectedIndices.delete(i); else selectedIndices.add(i);
      node.classList.toggle('selected');
    });
    
    node.draggable = true;
    node.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', idx);
    });

    handArea.appendChild(node);
  });
  adjustHandRows();
}

function adjustHandRows() {
  if (!handArea) return;
  const count = myHand.length;
  if (count > 10) handArea.classList.add('two-rows');
  else handArea.classList.remove('two-rows');
}

function renderPlayersList(){
  if (!playersList) return;
  playersList.innerHTML = '';
  playersState.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'playerItem';
    div.innerHTML = `<div class="avatar">${p.name[0]}</div> <b>${p.name}</b> <span style="margin-left:auto">${p.score}</span>`;
    playersList.appendChild(div);
  });
}

function renderSeats(){
  if (!seatsContainer || !tableScene) return;
  seatsContainer.innerHTML = '';
  const rect = tableScene.getBoundingClientRect();
  const cx = rect.width/2, cy = rect.height/2;
  const rx = rect.width*0.38, ry = rect.height*0.42;
  const n = Math.max(1, playersState.length);
  playersState.forEach((p,i) => {
    const angle = (i/n)*Math.PI*2 - Math.PI/2;
    const x = cx + Math.cos(angle)*rx - 65;
    const y = cy + Math.sin(angle)*ry - 40;
    const el = document.createElement('div');
    el.className = 'seat';
    el.style.left = x+'px'; el.style.top = y+'px';
    el.innerHTML = `<div class="playerBadge"><div class="avatar">${p.name[0]}</div> ${p.name}</div><div class="seatHand">Kart: ${p.handCount}</div>`;
    seatsContainer.appendChild(el);
  });
}

// --- ANİMASYON FONKSİYONLARI (TAMİR EDİLDİ) ---

// Uçan kart elementi oluşturma
function createFlyCard(text, back=false, w=68, h=96) {
  const fly = document.createElement('div');
  fly.className = 'fly-card' + (back ? ' back' : '');
  fly.style.width = w + 'px';
  fly.style.height = h + 'px';
  fly.style.position = 'fixed';
  fly.style.zIndex = 99999;
  fly.style.opacity = 0;
  
  const face = document.createElement('div');
  face.className = 'face';
  if(!back) face.innerHTML = `<span style="font-size:24px; font-weight:900; color:#333;">${text}</span>`;
  
  fly.appendChild(face);
  return fly;
}

// Oyuncu kendi kartını attığında
function animateLocalPlay(indices, cards) {
  if (!handArea || !centerPile) return;
  indices.forEach((idx, k) => {
    const elSel = handArea.querySelector(`.card3d[data-index="${idx}"]`);
    if (!elSel) return;
    
    const rect = elSel.getBoundingClientRect();
    const centerRect = centerPile.getBoundingClientRect();
    
    // Görünmez bir uçan kart yarat
    const fly = createFlyCard(cards[k] || '', false, rect.width, rect.height);
    fly.style.left = rect.left + 'px';
    fly.style.top = rect.top + 'px';
    document.body.appendChild(fly);

    const targetX = centerRect.left + centerRect.width/2 - rect.width/2;
    const targetY = centerRect.top + centerRect.height/2 - rect.height/2;

    requestAnimationFrame(()=> {
      fly.style.transition = 'transform 520ms cubic-bezier(.2,.9,.25,1), opacity 420ms ease';
      fly.style.transform = `translate(${targetX - rect.left}px, ${targetY - rect.top}px) rotate(${(Math.random()*30-15).toFixed(1)}deg) scale(.98)`;
      fly.style.opacity = '1';
    });

    setTimeout(()=> {
      centerPile.classList.add('center-pulse');
      setTimeout(()=> centerPile.classList.remove('center-pulse'), 420);
      fly.style.opacity = '0';
      setTimeout(()=> fly.remove(), 520);
    }, 520 + k * 60);
  });
}

// Başka oyuncu kart attığında
function animateRemotePlay(playerName, count) {
  if (!seatsContainer || !centerPile || !tableScene) return;
  const seats = seatsContainer.querySelectorAll('.seat');
  let sourceEl = null;
  
  // Hangi koltuk attı bul
  for (const s of seats) {
    if (s.innerText && s.innerText.indexOf(playerName) !== -1) { sourceEl = s; break; }
  }
  const fromRect = sourceEl ? sourceEl.getBoundingClientRect() : tableScene.getBoundingClientRect();
  const centerRect = centerPile.getBoundingClientRect();

  for (let i=0; i<count; i++){
    const fly = createFlyCard('', true, 46, 60); // Arkası dönük kart
    fly.style.left = (fromRect.left + i*6) + 'px';
    fly.style.top = (fromRect.top + i*6) + 'px';
    document.body.appendChild(fly);

    requestAnimationFrame(()=> {
      fly.style.transition = 'transform 520ms cubic-bezier(.2,.9,.25,1), opacity 420ms ease';
      fly.style.transform = `translate(${centerRect.left + centerRect.width/2 - 23 - parseFloat(fly.style.left)}px, ${centerRect.top + centerRect.height/2 - 30 - parseFloat(fly.style.top)}px) rotate(${(Math.random()*50-25).toFixed(0)}deg) scale(.98)`;
      fly.style.opacity = '1';
    });

    setTimeout(()=> {
      centerPile.classList.add('center-pulse');
      setTimeout(()=> centerPile.classList.remove('center-pulse'), 420);
      fly.style.opacity = '0';
      setTimeout(()=> fly.remove(), 520);
    }, 520 + i * 80);
  }
}

function showBluffOverlay(result, mainText, subText, duration = 2000) {
  if (!bluffOverlay || !bluffText || !bluffSub) return;
  
  // Varsa önceki timeout'ları temizle
  if (bluffOverlay._hideTimeout) clearTimeout(bluffOverlay._hideTimeout);
  
  bluffText.textContent = mainText;
  bluffSub.textContent = subText;

  const card = bluffOverlay.querySelector('.bluff-card');
  if (card) {
      card.classList.remove('result-true','result-false');
      if (result === true) card.classList.add('result-true');
      else if (result === false) card.classList.add('result-false');
  }

  bluffOverlay.classList.remove('hidden');
  void bluffOverlay.offsetWidth; // Reflow
  bluffOverlay.classList.add('show');

  if (duration > 0) {
    bluffOverlay._hideTimeout = setTimeout(() => {
      bluffOverlay.classList.remove('show');
      setTimeout(()=> bluffOverlay.classList.add('hidden'), 320);
    }, duration);
  }
}