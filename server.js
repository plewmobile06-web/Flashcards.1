import fs from "fs";
import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PIXABAY_KEY = "54726244-0fc3b5ea4b3d82698fc5045b0";

/* ========================= DATA MANAGEMENT ========================= */

const CATEGORY_FILE = "categories.json";
const SCORE_FILE = "scores.json";
const USER_FILE = "users.json"; 

const defaultData = {
  animal: ["cat","dog","elephant","tiger","lion","horse","cow","pig","rabbit","monkey"],
  fruit: ["apple","banana","mango","orange","grape","pineapple","watermelon","lemon","kiwi","cherry"]
};

// ⚡ ระบบ Image Cache แบบ Queue: เก็บรายการรูปภาพและตำแหน่งล่าสุดที่แสดง
const imageCache = {};

function loadJSON(filePath, defaultValue = {}) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    return content.trim() ? JSON.parse(content) : defaultValue;
  }
  return defaultValue;
}

let data = loadJSON(CATEGORY_FILE, defaultData);
let highScores = loadJSON(SCORE_FILE, {});
let users = loadJSON(USER_FILE, {});

// ตรวจสอบไฟล์เริ่มต้น
if (!fs.existsSync(CATEGORY_FILE)) fs.writeFileSync(CATEGORY_FILE, JSON.stringify(defaultData, null, 2));
if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(SCORE_FILE)) fs.writeFileSync(SCORE_FILE, JSON.stringify({}, null, 2));

const players = {};

/* ========================= FUNCTIONS ========================= */

function randomItem(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

function randomOptions(correct, arr){
  const wrong = arr.filter(x => x !== correct);
  const shuffled = wrong.sort(() => 0.5 - Math.random());
  const wrong4 = shuffled.slice(0, 4);
  return [...wrong4, correct].sort(() => 0.5 - Math.random());
}

// ฟังก์ชันสำหรับสุ่มลำดับ Array (Fisher-Yates Shuffle)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function generateImage(keyword, category){
  const cacheKey = `${category}_${keyword}`.toLowerCase();

  // 1. ตรวจสอบ Cache: ถ้ามีรูปในลิสต์ ให้วนไปรูปถัดไป
  if (imageCache[cacheKey] && imageCache[cacheKey].urls.length > 0) {
    const entry = imageCache[cacheKey];
    entry.currentIndex = (entry.currentIndex + 1) % entry.urls.length;
    console.log(`🚀 [Cache Hit] ${keyword} - แสดงรูปที่: ${entry.currentIndex + 1}/${entry.urls.length}`);
    return entry.urls[entry.currentIndex];
  }

  try {
    console.log(`🌐 [Fetching API] ค้นหารูปภาพ: ${keyword}`);
    
    const res = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: encodeURIComponent(keyword),
        image_type: "photo",
        safesearch: true,
        per_page: 50, // ดึงมาปริมาณมากเพื่อการกรองที่แม่นยำ
        orientation: "horizontal"
      },
      timeout: 5000 
    });

    if (res.data.hits && res.data.hits.length > 0) {
      // 🎯 กรองรูปภาพโดยตรวจสอบ Tags (ต้องมีคำศัพท์นั้นเป๊ะๆ) เพื่อความแม่นยำ
      let pool = res.data.hits.filter(img => {
        const tags = img.tags.toLowerCase().split(", ");
        return tags.includes(keyword.toLowerCase());
      });

      // ถ้ากรองเข้มงวดแล้วไม่เจอ ให้คลายตัวกรองเป็นการเช็คว่ามีคำนั้นอยู่ใน Tag หรือไม่
      if (pool.length === 0) {
        pool = res.data.hits.filter(img => img.tags.toLowerCase().includes(keyword.toLowerCase()));
      }
      
      // ถ้ายังไม่เจออีก ให้ใช้ผลลัพธ์ทั้งหมดที่ได้จาก API
      if (pool.length === 0) pool = res.data.hits;

      // สุ่มลำดับรูปภาพที่ได้มา
      const imageUrls = pool.map(img => img.webformatURL);
      const randomizedUrls = shuffleArray(imageUrls);

      // บันทึกลง Cache
      imageCache[cacheKey] = {
        urls: randomizedUrls,
        currentIndex: 0
      };

      return randomizedUrls[0];
    }
    return `https://via.placeholder.com/400?text=${keyword}`;
  } catch (error) {
    console.error(`❌ Error fetching image for ${keyword}:`, error.message);
    return `https://via.placeholder.com/400?text=${keyword}`;
  }
}

/* ========================= ROUTES ========================= */

app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });

  const name = username.trim();
  users = loadJSON(USER_FILE, {});

  if (users[name]) return res.status(400).json({ error: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" });

  users[name] = { password: password };
  fs.writeFileSync(USER_FILE, JSON.stringify(users, null, 2));
  res.json({ message: "ลงทะเบียนสำเร็จ" });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  users = loadJSON(USER_FILE, {}); 

  const user = users[username];
  if (user && user.password === password) {
    res.json({ message: "เข้าสู่ระบบสำเร็จ", username });
  } else {
    res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  }
});

app.get("/api/categories", (req, res) => res.json(Object.keys(data)));

app.get("/api/ranking", (req, res) => {
  highScores = loadJSON(SCORE_FILE, {});
  const rankingArray = Object.keys(highScores).map(name => ({
    name: name,
    score: highScores[name]
  })).sort((a, b) => b.score - a.score);
  res.json(rankingArray.slice(0, 10));
});

app.post("/api/category", (req, res) => {
  const { categoryName, items } = req.body;
  if (!categoryName || !items || items.length < 10) {
    return res.status(400).json({ error: "ต้องมีชื่อหมวดหมู่และคำศัพท์อย่างน้อย 10 คำ" });
  }
  const name = categoryName.trim().toLowerCase();
  data[name] = items.map(i => i.trim().toLowerCase());
  fs.writeFileSync(CATEGORY_FILE, JSON.stringify(data, null, 2));
  res.json({ message: "เพิ่มหมวดหมู่สำเร็จ", categories: Object.keys(data) });
});

app.post("/api/start", (req, res) => {
  const { name, category } = req.body;
  if (!data[category]) return res.status(400).json({ error: "Invalid category" });

  highScores = loadJSON(SCORE_FILE, {});
  players[name] = {
    score: 0,
    wrong: 0,
    category,
    highScore: highScores[name] || 0
  };
  res.json({ message: "Game started" });
});

app.get("/api/question/:name", async (req, res) => {
  const { name } = req.params;
  const player = players[name];
  if (!player) return res.status(400).json({ error: "Player not found" });

  const items = data[player.category];
  const correct = randomItem(items);
  
  const image = await generateImage(correct, player.category);
  const options = randomOptions(correct, items);

  player.currentAnswer = correct;
  res.json({ image, options, score: player.score, wrong: player.wrong, highScore: player.highScore });
});

app.post("/api/answer/:name", (req, res) => {
  const { name } = req.params;
  const { answer } = req.body;
  const player = players[name];

  if (!player) return res.status(400).json({ error: "Player not found" });

  let correct = (answer === player.currentAnswer);
  if (correct) { 
    player.score++; 
  } else { 
    player.wrong++; 
  }

  highScores = loadJSON(SCORE_FILE, {}); 
  if (player.score > (highScores[name] || 0)) {
    player.highScore = player.score;
    highScores[name] = player.score;
    fs.writeFileSync(SCORE_FILE, JSON.stringify(highScores, null, 2));
  }

  const gameOver = player.wrong >= 5;
  res.json({ 
    correct, 
    correctAnswer: player.currentAnswer, 
    score: player.score, 
    wrong: player.wrong, 
    gameOver, 
    finalScore: player.score, 
    highScore: highScores[name] || player.score 
  });
});

app.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});