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

// ค่าเริ่มต้นถ้ายังไม่มีไฟล์ categories.json
const defaultData = {
  animal: ["cat","dog","elephant","tiger","lion","horse","cow","pig","rabbit","monkey"],
  fruit: ["apple","banana","mango","orange","grape","pineapple","watermelon","lemon","kiwi","cherry"]
};

// โหลดข้อมูลหมวดหมู่
let data = defaultData;
if (fs.existsSync(CATEGORY_FILE)) {
  data = JSON.parse(fs.readFileSync(CATEGORY_FILE));
} else {
  fs.writeFileSync(CATEGORY_FILE, JSON.stringify(defaultData, null, 2));
}

// โหลดคะแนนสูงสุด
let highScores = {};
if (fs.existsSync(SCORE_FILE)) {
  highScores = JSON.parse(fs.readFileSync(SCORE_FILE));
}

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
  try {
    const query = `"${keyword}" ${category}`;
    const res = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: query,
        image_type: "photo",
        safesearch: true,
        per_page: 20
      }
    });

    if (res.data.hits && res.data.hits.length > 0) {
      const filtered = res.data.hits.filter(img => 
        img.tags.toLowerCase().includes(keyword.toLowerCase())
      );
      const pool = filtered.length > 0 ? filtered : res.data.hits;
      return pool[Math.floor(Math.random() * pool.length)].webformatURL;
    }
    return `https://via.placeholder.com/400?text=${keyword}`;
  } catch (error) {
    return `https://via.placeholder.com/400?text=${keyword}`;
  }
}

/* ========================= ROUTES ========================= */

// ดึงรายชื่อหมวดหมู่ทั้งหมด
app.get("/api/categories", (req, res) => {
  res.json(Object.keys(data));
});

// เพิ่มหมวดหมู่ใหม่และบันทึกลงไฟล์
app.post("/api/category", (req, res) => {
  const { categoryName, items } = req.body;

  if (!categoryName || !items || items.length < 10) {
    return res.status(400).json({ error: "ต้องมีชื่อหมวดหมู่และคำศัพท์อย่างน้อย 10 คำ" });
  }

  const name = categoryName.trim().toLowerCase();
  data[name] = items.map(i => i.trim().toLowerCase());

  // บันทึกลงไฟล์ categories.json ทันทีเพื่อให้ข้อมูลไม่หาย
  fs.writeFileSync(CATEGORY_FILE, JSON.stringify(data, null, 2));

  res.json({ message: "เพิ่มหมวดหมู่สำเร็จ", categories: Object.keys(data) });
});

app.post("/api/start", (req, res) => {
  const { name, category } = req.body;
  if (!data[category]) return res.status(400).json({ error: "Invalid category" });

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

  res.json({
    image,
    options,
    score: player.score,
    wrong: player.wrong,
    highScore: player.highScore
  });
});

app.post("/api/answer/:name", (req, res) => {
  const { name } = req.params;
  const { answer } = req.body;
  const player = players[name];

  if (!player) return res.status(400).json({ error: "Player not found" });

  let correct = answer === player.currentAnswer;
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

/* ========================= START SERVER ========================= */

app.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});