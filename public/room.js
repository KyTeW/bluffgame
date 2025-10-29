const socket = io();
const roomId = localStorage.getItem("roomId");
const playerName = localStorage.getItem("playerName");

const roomTitle = document.getElementById("roomTitle");
const playerSlots = document.getElementById("playerSlots");
const statusText = document.getElementById("status");
const startGameBtn = document.getElementById("startGameBtn");
const leaveBtn = document.getElementById("leaveBtn");

// 🚨 Eğer geçersiz girişse ana sayfaya yönlendir
if (!roomId || !playerName) {
  alert("Geçersiz giriş! Ana sayfaya yönlendiriliyorsunuz.");
  window.location.href = "index.html";
}

roomTitle.textContent = `Oda Kodu: ${roomId}`;

// 🔗 Odaya katıl
socket.emit("joinRoom", { roomId, playerName }, (res) => {
  if (!res.success) {
    alert(res.message || "Odaya katılınamadı!");
    window.location.href = "index.html";
  }
});

// 🎮 Oyuncu listesi güncellemesi
socket.on("updatePlayers", (players) => {
  playerSlots.innerHTML = "";
  players.forEach((p) => {
    const div = document.createElement("div");
    div.className = "player-slot filled";
    div.innerHTML = `<strong>${p.name}</strong>`;
    playerSlots.appendChild(div);
  });

  statusText.textContent = `${players.length} oyuncu bağlı.`;
});

// 🎴 Oyun başlat
startGameBtn.addEventListener("click", () => {
  socket.emit("startGame", { roomId });
});

// 🃏 Kartlar geldiğinde göster
socket.on("gameStarted", (distributed) => {
  const myCards = distributed[socket.id] || [];
  alert(`Oyun başladı! Kartların: ${myCards.join(", ")}`);
});

// ⛔ Oda kapandıysa
socket.on("roomClosed", () => {
  alert("Oda süresi doldu. Ana sayfaya dönülüyor.");
  window.location.href = "index.html";
});

// 🚪 Ayrıl butonu
leaveBtn.addEventListener("click", () => {
  socket.disconnect();
  window.location.href = "index.html";
});
