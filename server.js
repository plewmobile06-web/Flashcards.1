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

// โหลดข้อมูลหมวดหมู่จากไฟล์ (ถ้าไม่มีให้ใช้ค่าเริ่มต้น)
const CATEGORY_FILE = "categories.json";
let data = { animal: ["cat"], fruit: ["apple"] }; 

if (fs.existsSync(CATEGORY_FILE)) {
    data = JSON.parse(fs.readFileSync(CATEGORY_FILE, "utf-8"));
} else {
    fs.writeFileSync(CATEGORY_FILE, JSON.stringify(data, null, 2));
}

const players = {};
let highScores = {};
if (fs.existsSync("scores.json")) {
    highScores = JSON.parse(fs.readFileSync("scores.json"));
}

/* ========================= FUNCTION ========================= */

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomOptions(correct, arr) {
    const wrong = arr.filter(x => x !== correct);
    const shuffled = wrong.sort(() => 0.5 - Math.random());
    const wrong4 = shuffled.slice(0, 4);
    return [...wrong4, correct].sort(() => 0.5 - Math.random());
}

async function generateImage(keyword, category) {
    try {
        const query = `"${keyword}" ${category}`;
        const res = await axios.get("https://pixabay.com/api/", {
            params: {
                key: PIXABAY_KEY,
                q: query,
                image_type: "photo",
                safesearch: true,
                per_page: 30
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

// 🆕 เพิ่ม Endpoint สำหรับให้ผู้เล่นเพิ่มหมวดหมู่ใหม่
app.post("/api/category", (req, res) => {
    const { categoryName, items } = req.body;

    if (!categoryName || !items || !Array.isArray(items) || items.length < 5) {
        return res.status(400).json({ error: "ต้องมีชื่อหมวดหมู่และคำศัพท์อย่างน้อย 5 คำ" });
    }

    // บันทึกลงในตัวแปร และ เขียนลงไฟล์ JSON
    data[categoryName] = items;
    fs.writeFileSync(CATEGORY_FILE, JSON.stringify(data, null, 2));

    res.json({ message: "เพิ่มหมวดหมู่สำเร็จ", categories: Object.keys(data) });
});

// 🆕 เพิ่ม Endpoint สำหรับดูหมวดหมู่ทั้งหมดที่มี
app.get("/api/categories", (req, res) => {
    res.json(Object.keys(data));
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
    let correct = randomItem(items);
    let image = await generateImage(correct, player.category);

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

    let correct = (answer === player.currentAnswer);
    if (correct) player.score++; else player.wrong++;

    if (player.score > player.highScore) {
        player.highScore = player.score;
        highScores[name] = player.score;
        fs.writeFileSync("scores.json", JSON.stringify(highScores, null, 2));
    }

    res.json({
        correct,
        correctAnswer: player.currentAnswer,
        score: player.score,
        wrong: player.wrong,
        gameOver: player.wrong >= 5
    });
});

app.get("/api/ranking", (req, res) => {
    const ranking = Object.entries(highScores)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score);
    res.json(ranking);
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});