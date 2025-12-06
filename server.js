const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "*", // Güvenlik için daha sonra site adresini yazabilirsin
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});

// Sadece sayılar (1-10)
const RANKS = ['1','2','3','4','5','6','7','8','9','10'];

// Oyuncu sayısına göre dinamik deste
function makeDeck(playerCount) {
  const deck = [];
  // Her sayıdan oyuncu sayısı kadar ekle
  for (const r of RANKS) {
    for (let i = 0; i < playerCount; i++) {
      deck.push(r);
    }
  }
  // Karıştır
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function makeRoomCode() {
  return crypto.randomBytes(3).toString('base64url').slice(0,6).toUpperCase();
}

const rooms = new Map();

function broadcastRoom(room) {
  if (!room) return;
  io.to(room.code).emit('room_update', {
    name: room.name,
    code: room.code,
    maxPlayers: room.maxPlayers,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      seat: p.seatIndex,
      score: p.score,
      handCount: Array.isArray(p.hand) ? p.hand.length : 0
    })),
    state: room.state,
    round: room.round,
    targetRank: room.targetRank ?? null // null ise "Henüz seçilmedi"
  });
}

io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('create_room', ({ name, maxPlayers, playerName }, cb) => {
    maxPlayers = Math.max(2, Math.min(10, Number(maxPlayers) || 4));
    const code = makeRoomCode();
    const room = {
      code,
      name: name || `${playerName || 'Anon'}'s room`,
      maxPlayers,
      players: [],
      state: 'lobby',
      deck: [],
      table: [],
      turnIndex: 0,
      round: 0,
      targetRank: null,
      history: []
    };
    rooms.set(code, room);

    const player = { id: socket.id, name: playerName || 'Anon', seatIndex: 0, hand: [], score: 0 };
    room.players.push(player);

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerName = player.name;

    broadcastRoom(room);
    cb && cb({ ok: true, code });
  });

  socket.on('join_room', ({ code, playerName }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'Oda bulunamadı' });
    if (room.players.length >= room.maxPlayers) return cb && cb({ ok: false, error: 'Oda dolu' });
    if (room.state !== 'lobby') return cb && cb({ ok: false, error: 'Oyun zaten başlamış' });

    const used = new Set(room.players.map(p => p.seatIndex));
    let seat = 0; while (used.has(seat)) seat++;
    const player = { id: socket.id, name: playerName || 'Anon', seatIndex: seat, hand: [], score: 0 };
    room.players.push(player);

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerName = player.name;

    broadcastRoom(room);
    cb && cb({ ok: true });
  });

  socket.on('leave_room', (_, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb && cb({ ok: false });
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false });
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(code);
    delete socket.data.roomCode;
    if (room.players.length === 0) {
      rooms.delete(code);
    } else {
      room.turnIndex = room.turnIndex % Math.max(1, room.players.length);
      broadcastRoom(room);
    }
    cb && cb({ ok: true });
  });

  socket.on('start_game', (_, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb && cb({ ok: false, error: 'Odaya bağlı değilsiniz' });
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: 'Oda bulunamadı' });
    if (room.players.length < 2) return cb && cb({ ok: false, error: 'En az 2 oyuncu gerekli' });

    // Desteyi hazırla
    room.deck = makeDeck(room.players.length);
    
    // Kart dağıt (Kişi başı 10)
    room.players.forEach(p => p.hand = []);
    const handSize = 10;
    for (let i = 0; i < handSize; i++) {
        room.players.forEach(p => {
            if (room.deck.length > 0) p.hand.push(room.deck.pop());
        });
    }

    room.table = [];
    room.state = 'playing';
    room.turnIndex = 0;
    room.round = 1;
    room.history = [];
    room.targetRank = null; // HEDEF YOK, İLK OYUNCU SEÇECEK

    io.to(code).emit('game_started', { round: room.round, targetRank: null });

    room.players.forEach(p => {
      io.to(p.id).emit('your_hand', p.hand);
    });

    broadcastRoom(room);
    cb && cb({ ok: true });
  });

  socket.on('play_cards', ({ cards, declared }, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb && cb({ ok: false, error: 'Odaya bağlı değilsiniz' });
    const room = rooms.get(code);
    if (!room || room.state !== 'playing') return cb && cb({ ok: false, error: 'Oyun yok' });

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return cb && cb({ ok: false, error: 'Oyuncu oda içinde değil' });
    if (playerIndex !== room.turnIndex) return cb && cb({ ok: false, error: 'Sıra sizde değil' });

    const player = room.players[playerIndex];

    if (!Array.isArray(cards) || cards.length === 0) return cb && cb({ ok: false, error: 'En az 1 kart oynamalısınız' });

    // --- KRİTİK NOKTA: HEDEF BELİRLEME ---
    // Masada kart yoksa (turun başı), oyuncu hedefi belirlemek ZORUNDA.
    if (room.table.length === 0) {
        if (!declared || !RANKS.includes(declared)) {
            return cb({ ok: false, error: 'Bu elin sayısını (hedefi) seçmek zorundasınız!' });
        }
        room.targetRank = declared; // Hedef kilitlendi
    }
    // --------------------------------------

    // Elde var mı kontrolü
    for (const c of cards) {
      if (!player.hand.includes(c)) return cb && cb({ ok: false, error: 'Elinizde olmayan kart seçimi' });
    }

    const playedRanks = [...cards]; 

    // Kartları elden sil
    for (const c of cards) {
      const idx = player.hand.indexOf(c);
      if (idx !== -1) player.hand.splice(idx, 1);
    }

    const play = {
      by: socket.id,
      name: player.name,
      cardsPlayed: cards,
      playedRanks, 
      count: cards.length,
      declared: room.targetRank, // O an geçerli hedef
      timestamp: Date.now()
    };

    room.table.push(play);
    room.history.push({ type: 'play', play });

    if (room.players.length > 0) {
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
    }

    io.to(code).emit('table_update', {
      table: room.table,
      lastPlay: {
        by: play.by,
        name: play.name,
        count: play.count,
        actualRanks: play.playedRanks,
        declared: play.declared
      },
      target: room.targetRank
    });

    room.players.forEach(p => {
      io.to(p.id).emit('your_hand', p.hand);
    });

    // Oyun bitti mi?
    if (player.hand.length === 0) {
      player.score += 10;
      io.to(code).emit('round_end', { winners: [{ name: player.name, score: player.score }] });
      room.state = 'lobby';
      broadcastRoom(room);
      return cb && cb({ ok: true });
    }

    broadcastRoom(room);
    cb && cb({ ok: true });
  });

  socket.on('call_bluff', (_, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb && cb({ ok: false, error: 'Odaya bağlı değilsiniz' });
    const room = rooms.get(code);
    if (!room || room.table.length === 0) return cb && cb({ ok: false, error: 'Ortada kart yok' });

    const lastPlay = room.table[room.table.length - 1];
    const callerIdx = room.players.findIndex(p => p.id === socket.id);
    const liarIdx = room.players.findIndex(p => p.id === lastPlay.by);

    if (callerIdx === -1 || liarIdx === -1) return cb && cb({ ok: false, error: 'Hata' });

    const target = room.targetRank;
    const anyNonTarget = lastPlay.playedRanks.some(r => r !== target);

    if (anyNonTarget) {
      // Yakalandı
      room.players[liarIdx].score -= 5;
      room.players[callerIdx].score += 3;
      io.to(code).emit('bluff_result', { result: 'liar', liar: room.players[liarIdx].name, caller: room.players[callerIdx].name, target });
    } else {
      // Dürüsttü
      room.players[callerIdx].score -= 3;
      io.to(code).emit('bluff_result', { result: 'truthful', truthful: room.players[liarIdx].name, caller: room.players[callerIdx].name, target });
    }

    // YENİ TUR: Masayı temizle, HEDEFİ SIFIRLA (null yap)
    room.table = [];
    room.round += 1;
    room.targetRank = null; // <--- Burası çok önemli, null oluyor ki yeni turda kazanan seçsin.
    room.turnIndex = callerIdx % Math.max(1, room.players.length); 

    room.players.forEach(p => io.to(p.id).emit('your_hand', p.hand));
    broadcastRoom(room);
    cb && cb({ ok: true });
  });

  socket.on('next_round', (_, cb) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false });

    room.deck = makeDeck(room.players.length);
    room.players.forEach(p => p.hand = []);
    for (let i = 0; i < 10; i++) {
      room.players.forEach(p => { if (room.deck.length > 0) p.hand.push(room.deck.pop()); });
    }

    room.table = [];
    room.state = 'playing';
    room.round += 1;
    room.turnIndex = 0;
    room.targetRank = null; // Sıfırla

    room.players.forEach(p => io.to(p.id).emit('your_hand', p.hand));
    io.to(room.code).emit('game_started', { round: room.round, targetRank: null });
    broadcastRoom(room);
    cb && cb({ ok: true });
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (room.players.length === 0) rooms.delete(code);
    else {
      room.turnIndex = room.turnIndex % Math.max(1, room.players.length);
      broadcastRoom(room);
    }
  });
});

server.listen(PORT, () => console.log('Server listening on', PORT));