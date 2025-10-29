const socket = io();

// Buton ve form elementleri
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const createForm = document.getElementById("createForm");
const joinForm = document.getElementById("joinForm");
const backBtns = document.querySelectorAll(".backBtn");

// Formlar arası geçiş
createBtn.addEventListener("click", () => {
  createForm.style.display = "block";
  joinForm.style.display = "none";
});

joinBtn.addEventListener("click", () => {
  joinForm.style.display = "block";
  createForm.style.display = "none";
});

backBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    createForm.style.display = "none";
    joinForm.style.display = "none";
  });
});

// ✅ Oda oluşturma
document.getElementById("createSubmit").addEventListener("click", (e) => {
  e.preventDefault();

  const roomName = document.getElementById("roomName").value.trim();
  const maxPlayers = parseInt(document.getElementById("maxPlayers").value);
  const playerName = document.getElementById("createPlayerName").value.trim();

  if (!roomName || !playerName || !maxPlayers) {
    alert("Lütfen tüm alanları doldur.");
    return;
  }

  console.log("Oda oluşturma isteği gönderiliyor..."); // 🧩 test log

  socket.emit("createRoom", { roomName, maxPlayers, playerName }, (res) => {
    console.log("Sunucudan gelen yanıt:", res); // 🧩 test log

    if (!res) {
      alert("Sunucu yanıt vermedi. Lütfen tekrar deneyin.");
      return;
    }

    if (res.success) {
      localStorage.setItem("playerName", playerName);
      localStorage.setItem("roomId", res.roomId);
      window.location.href = "room.html";
    } else {
      alert(res.message || "Oda oluşturulamadı! Lütfen başka bir isim deneyin.");
    }
  });
});

// ✅ Odaya katılma
document.getElementById("joinSubmit").addEventListener("click", (e) => {
  e.preventDefault();

  const roomId = document.getElementById("roomId").value.trim();
  const playerName = document.getElementById("joinPlayerName").value.trim();

  if (!roomId || !playerName) {
    alert("Lütfen tüm alanları doldur.");
    return;
  }

  console.log("Odaya katılma isteği gönderiliyor..."); // 🧩 test log

  socket.emit("joinRoom", { roomId, playerName }, (res) => {
    console.log("Sunucudan gelen yanıt:", res); // 🧩 test log

  if (!res) {
      alert("Sunucu yanıt vermedi. Lütfen tekrar deneyin.");
      return;
    }

    if (res.success) {
      localStorage.setItem("playerName", playerName);
      localStorage.setItem("roomId", roomId);
      window.location.href = "room.html";
    } else {
      alert(res.message || "Odaya katılamadın! ID'yi kontrol et.");
    }
  });
});

// 🔌 Bağlantı durumlarını yakala
socket.on("connect", () => {
  console.log("✅ Sunucuya bağlanıldı:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Sunucu bağlantısı koptu");
});

socket.on("connect_error", (err) => {
  console.error("🚫 Bağlantı hatası:", err.message);
  alert("Sunucuya bağlanılamadı. Lütfen sunucunun açık olduğundan emin olun.");
});
