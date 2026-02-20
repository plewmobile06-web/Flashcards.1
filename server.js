import express from "express";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 ใส่ Pixabay API Key ตรงนี้
const PIXABAY_KEY = "54726244-0fc3b5ea4b3d82698fc5045b0";

const data = {
  animal: [
    "cat","dog","lion","tiger","elephant",
    "zebra","giraffe","monkey","panda","bear"
  ],
  fruit: [
    "apple","banana","mango","orange","grape",
    "pineapple","durian","watermelon","papaya","kiwi"
  ]
};

const players = {};

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomOptions(correct, arr) {
  const wrong = arr.filter(x => x !== correct);
  const shuffled = wrong.sort(() => 0.5 - Math.random());
  const wrong4 = shuffled.slice(0, 4);
  return [...wrong4, correct].sort(() => 0.5 - Math.random());
}

// ✅ ดึงรูปตรงคำตอบจริง
async function generateImage(keyword, category) {
  try {
    const query = `${keyword} ${category}`;

    const res = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: query,
        image_type: "photo",
        safesearch: true,
        per_page: 20
      }
    });

    if (!res.data.hits.length) {
      return "https://via.placeholder.com/600";
    }

    const randomImage =
      res.data.hits[Math.floor(Math.random() * res.data.hits.length)];

    return randomImage.webformatURL;

  } catch (err) {
    console.log("PIXABAY ERROR:", err.message);
    return "https://via.placeholder.com/600";
  }
}

/* ========================= */

app.post("/api/start", (req, res) => {
  const { name, category } = req.body;

  if (!data[category]) {
    return res.status(400).json({ error: "Invalid category" });
  }

  players[name] = {
    score: 0,
    wrong: 0,
    category,
    highScore: players[name]?.highScore || 0
  };

  res.json({ message: "Game started" });
});

app.get("/api/question/:name", async (req, res) => {

  const { name } = req.params;
  const player = players[name];

  if (!player) {
    return res.status(400).json({ error: "Player not found" });
  }

  if (player.wrong >= 5) {
    return res.json({
      gameOver: true,
      finalScore: player.score,
      highScore: player.highScore
    });
  }

  const items = data[player.category];
  const correct = randomItem(items);

  const image = await generateImage(correct, player.category);
  const options = randomOptions(correct, items);

  player.currentAnswer = correct;

  res.json({
    image,
    options,
    score: player.score,
    wrong: player.wrong
  });
});

app.post("/api/answer/:name", (req, res) => {

  const { name } = req.params;
  const { answer } = req.body;

  const player = players[name];
  if (!player) return res.status(400).json({ error: "Player not found" });

  let correct = false;

  if (answer === player.currentAnswer) {
    player.score++;
    correct = true;
  } else {
    player.wrong++;
  }

  if (player.score > player.highScore) {
    player.highScore = player.score;
  }

  if (player.wrong >= 5) {
    return res.json({
      correct,
      gameOver: true,
      finalScore: player.score,
      highScore: player.highScore
    });
  }

  res.json({
    correct,
    score: player.score,
    wrong: player.wrong
  });
});

/* ========================= */

const PORT = process.env.PORT || 7777;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});