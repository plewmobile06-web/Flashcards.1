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

// ⚡ ระบบ Image Cache เพื่อเก็บ URL รูปที่เคยดึงมาแล้ว ไม่ต้องเรียก API ซ้ำ
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

if (!fs.existsSync(CATEGORY_FILE)) fs.writeFileSync(CATEGORY_FILE, JSON.stringify(defaultData, null, 2));
if (!fs.existsSync(USER_FILE)) fs.writeFileSync(USER_FILE, JSON.stringify({}, null, 2));

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

async function generateImage(keyword, category){
  // 1. ตรวจสอบใน Cache ก่อน ถ้ามีให้ส่งคืนทันที (เร็วที่สุด)
  const cacheKey = `${category}_${keyword}`.toLowerCase();
  if (imageCache[cacheKey]) {
    console.log(`🚀 [Cache Hit] ${keyword}`);
    return imageCache[cacheKey];
  }

  try {
    console.log(`🌐 [Fetching API] ${keyword}`);
    const query = `"${keyword}" ${category}`;
    const res = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: query,
        image_type: "photo",
        safesearch: true,
        per_page: 20
      },
      timeout: 5000 // ⏳ ตั้งเวลาคอยแค่ 5 วินาที ถ้า API ช้าให้ Error ทันทีเพื่อไปใช้รูปสำรอง
    });

    if (res.data.hits && res.data.hits.length > 0) {
      const filtered = res.data.hits.filter(img => 
        img.tags.toLowerCase().includes(keyword.toLowerCase())
      );
      const pool = filtered.length > 0 ? filtered : res.data.hits;
      const imageUrl = pool[Math.floor(Math.random() * pool.length)].webformatURL;
      
      // เก็บลง Cache ไว้ใช้ครั้งต่อไป
      imageCache[cacheKey] = imageUrl;
      return imageUrl;
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
app.get("/api/all-data", (req, res) => res.json(data));
app.get("/api/ranking", (req, res) => {
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

/* ========================= ADD WORD ROUTE ========================= */

app.post("/api/category/add-word", (req, res) => {
    const { categoryName, word } = req.body;
    if (!categoryName || !word) return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });

    // 💡 แก้ไขให้ค้นหาหมวดหมู่โดยไม่สนตัวพิมพ์เล็ก-ใหญ่
    const actualKey = Object.keys(data).find(
        key => key.toLowerCase() === categoryName.toLowerCase()
    );

    if (actualKey) {
        const newWord = word.trim().toLowerCase();
        if (!data[actualKey].includes(newWord)) {
            data[actualKey].push(newWord);
            fs.writeFileSync(CATEGORY_FILE, JSON.stringify(data, null, 2));
            res.json({ message: "เพิ่มคำศัพท์สำเร็จ", words: data[actualKey] });
        } else {
            res.status(400).json({ error: "มีคำศัพท์นี้อยู่แล้ว" });
        }
    } else {
        res.status(404).json({ error: "ไม่พบหมวดหมู่ที่ระบุ" });
    }
});

/* ========================= DELETE CATEGORY ROUTE ========================= */

app.delete("/api/category/:name", (req, res) => {
    const catName = req.params.name.toLowerCase();
    
    // ป้องกันการลบหมวดหมู่พื้นฐาน (Optional)
    const protectedCategories = ["animal", "fruit"];
    if (protectedCategories.includes(catName)) {
        return res.status(403).json({ error: "ไม่สามารถลบหมวดหมู่เริ่มต้นได้" });
    }

    if (data[catName]) {
        delete data[catName];
        fs.writeFileSync(CATEGORY_FILE, JSON.stringify(data, null, 2));
        res.json({ message: "ลบหมวดหมู่สำเร็จ" });
    } else {
        res.status(404).json({ error: "ไม่พบหมวดหมู่" });
    }
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
  
  // เรียกใช้ฟังก์ชันที่มีระบบ Cache และ Timeout
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

  if (player.score > player.highScore) {
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
    highScore: player.highScore 
  });
});

app.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});