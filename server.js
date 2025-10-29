const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  // 🎮 Oda oluşturma
  socket.on("createRoom", (data, callback) => {
    const { roomName, maxPlayers, playerName } = data;

    if (!roomName || !playerName) {
      return callback({ success: false, message: "Eksik bilgi!" });
    }

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Odayı kaydet
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      maxPlayers,
      players: [{ id: socket.id, name: playerName }],
    };

    socket.join(roomId);
    console.log(`🆕 Oda oluşturuldu: ${roomId} (${roomName})`);

    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
    callback({ success: true, roomId });

    // ⏰ 1 saat sonra odayı sil
    setTimeout(() => {
      if (rooms[roomId]) {
        io.to(roomId).emit("roomClosed");
        delete rooms[roomId];
        console.log(`🗑️ Oda silindi (1 saat doldu): ${roomId}`);
      }
    }, 3600000);
  });

  // 🧩 Odaya katılma
  socket.on("joinRoom", ({ roomId, playerName }, callback) => {
    const room = rooms[roomId];

    if (!room) return callback({ success: false, message: "Oda bulunamadı." });
    if (room.players.length >= room.maxPlayers)
      return callback({ success: false, message: "Oda dolu." });

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);

    io.to(roomId).emit("updatePlayers", room.players);
    console.log(`👤 ${playerName} odaya katıldı: ${roomId}`);

    callback({ success: true, roomId });
  });

  // 🎴 Oyun başlatma
  socket.on("startGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const cards = generateCards(52);
    const distributed = {};

    room.players.forEach((p) => {
      distributed[p.id] = cards.splice(0, Math.floor(52 / room.players.length));
    });

    io.to(roomId).emit("gameStarted", distributed);
  });

  // 🧨 Oyuncu ayrıldığında
  socket.on("disconnect", () => {
    for (const id in rooms) {
      const room = rooms[id];
      const index = room.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        console.log(`🚪 Oyuncu ayrıldı: ${room.players[index].name}`);
        room.players.splice(index, 1);
        io.to(id).emit("updatePlayers", room.players);
        if (room.players.length === 0) {
          delete rooms[id];
          console.log(`🗑️ Oda silindi (boş kaldı): ${id}`);
        }
        break;
      }
    }
  });
});

// 🃏 Basit kart üretici
function generateCards(count) {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = [];

  for (const s of suits) {
    for (const r of ranks) {
      deck.push(`${r}${s}`);
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck.slice(0, count);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Sunucu çalışıyor: http://localhost:${PORT}`));
