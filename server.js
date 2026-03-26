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

const defaultData = {
  animals: ["cat", "dog", "elephant", "tiger", "lion", "horse", "cow", "pig", "rabbit", "monkey"],
  fruits: ["apple", "banana", "mango", "orange", "grape", "pineapple", "watermelon", "lemon", "kiwi", "cherry"]
};

function loadJSON(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return content.trim() ? JSON.parse(content) : defaultValue;
    }
  } catch (e) { console.error("Error loading JSON:", e); }
  return defaultValue;
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let categories = loadJSON(CATEGORY_FILE, defaultData);
let highScores = loadJSON(SCORE_FILE, {});

// สร้างไฟล์เริ่มต้นถ้ายังไม่มี
if (!fs.existsSync(CATEGORY_FILE)) saveJSON(CATEGORY_FILE, defaultData);

const players = {};
const imageCache = {};

/* ========================= HELPER FUNCTIONS ========================= */

async function generateImage(keyword, category) {
  const cacheKey = `${category}_${keyword}`.toLowerCase();
  if (imageCache[cacheKey]) {
    const entry = imageCache[cacheKey];
    entry.currentIndex = (entry.currentIndex + 1) % entry.urls.length;
    return entry.urls[entry.currentIndex];
  }

  try {
    const res = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: encodeURIComponent(keyword),
        image_type: "photo",
        safesearch: true,
        per_page: 20
      },
      timeout: 5000 
    });

    if (res.data.hits && res.data.hits.length > 0) {
      const urls = res.data.hits.map(img => img.webformatURL);
      imageCache[cacheKey] = { urls, currentIndex: 0 };
      return urls[0];
    }
  } catch (error) {
    console.error(`❌ Pixabay Error for ${keyword}:`, error.message);
  }
  return `https://via.placeholder.com/400?text=${keyword}`;
}

/* ========================= ROUTES ========================= */

// 1. ดึงข้อมูลหมวดหมู่ทั้งหมด (ส่งทั้ง Object ไปให้ Frontend ใช้)
app.get("/api/all-data", (req, res) => {
  categories = loadJSON(CATEGORY_FILE, defaultData);
  res.json(categories);
});

// 2. เพิ่มหมวดหมู่ใหม่
app.post("/api/category", (req, res) => {
  const { categoryName, items } = req.body;
  if (!categoryName || !items || items.length < 3) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน" });
  }
  const name = categoryName.trim().toLowerCase();
  categories[name] = items.map(i => i.trim().toLowerCase());
  saveJSON(CATEGORY_FILE, categories);
  res.json({ message: "เพิ่มสำเร็จ" });
});

// 3. เพิ่มคำศัพท์ในหมวดหมู่เดิม
app.post("/api/category/add-word", (req, res) => {
  const { categoryName, word } = req.body;
  const name = categoryName.toLowerCase();
  if (categories[name]) {
    categories[name].push(word.trim().toLowerCase());
    saveJSON(CATEGORY_FILE, categories);
    return res.json({ message: "เพิ่มคำศัพท์สำเร็จ" });
  }
  res.status(404).json({ error: "ไม่พบหมวดหมู่" });
});

// 4. ลบหมวดหมู่
app.delete("/api/category/:name", (req, res) => {
  const name = req.params.name.toLowerCase();
  const protectedCats = ["animals", "fruits"];
  if (protectedCats.includes(name)) return res.status(403).json({ error: "ห้ามลบหมวดหมู่หลัก" });
  
  if (categories[name]) {
    delete categories[name];
    saveJSON(CATEGORY_FILE, categories);
    return res.json({ message: "ลบสำเร็จ" });
  }
  res.status(404).json({ error: "ไม่พบหมวดหมู่" });
});

// 5. เริ่มเกม
app.post("/api/start", (req, res) => {
  const { name, category } = req.body;
  if (!categories[category]) return res.status(400).json({ error: "หมวดหมู่ไม่ถูกต้อง" });

  players[name] = {
    score: 0,
    wrong: 0,
    category,
    highScore: highScores[name] || 0
  };
  res.json({ message: "เริ่มเกม" });
});

// 6. ดึงคำถาม
app.get("/api/question/:name", async (req, res) => {
  const { name } = req.params;
  const player = players[name];
  if (!player) return res.status(400).json({ error: "ไม่พบผู้เล่น" });

  const items = categories[player.category];
  const correct = items[Math.floor(Math.random() * items.length)];
  
  const image = await generateImage(correct, player.category);
  
  // สุ่มตัวเลือก 4 ตัว (รวมคำตอบที่ถูก)
  let options = items.filter(x => x !== correct)
                     .sort(() => 0.5 - Math.random())
                     .slice(0, 3);
  options.push(correct);
  options.sort(() => 0.5 - Math.random());

  player.currentAnswer = correct;
  res.json({ image, options, score: player.score, wrong: player.wrong });
});

// 7. ตอบคำถาม
app.post("/api/answer/:name", (req, res) => {
  const { name } = req.params;
  const { answer } = req.body;
  const player = players[name];

  if (!player) return res.status(400).json({ error: "ไม่พบผู้เล่น" });

  const isCorrect = (answer.toLowerCase() === player.currentAnswer.toLowerCase());
  if (isCorrect) {
    player.score++;
  } else {
    player.wrong++;
  }

  if (player.score > (highScores[name] || 0)) {
    highScores[name] = player.score;
    saveJSON(SCORE_FILE, highScores);
  }

  res.json({
    correct: isCorrect,
    correctAnswer: player.currentAnswer,
    score: player.score,
    wrong: player.wrong,
    gameOver: player.wrong >= 5
  });
});

app.listen(3000, () => {
  console.log("🚀 FlashAI Server ready at http://localhost:3000");
});