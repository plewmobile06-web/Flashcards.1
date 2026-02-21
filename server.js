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

// 🔥 ใส่ API Key ของคุณตรงนี้
const PIXABAY_KEY = "54726244-0fc3b5ea4b3d82698fc5045b0";

const data = {
  animal: [
    "cat","dog","lion","tiger","elephant",
    "zebra","giraffe","monkey","panda","bear",
    "horse","cow","buffalo","goat","sheep",
    "deer","wolf","fox","rabbit","kangaroo",
    "koala","hippopotamus","rhinoceros","leopard","cheetah",
    "camel","donkey","squirrel","bat","otter",
    "polar bear","sloth","chimpanzee","gorilla","hamster",
    "mouse","rat","hedgehog","skunk","raccoon",
    "crocodile","alligator","snake","lizard","turtle",
    "frog","penguin","owl","eagle","parrot"
  ],
  fruit: [
    "apple","banana","mango","orange","grape",
    "pineapple","durian","watermelon","papaya","kiwi",
    "strawberry","blueberry","raspberry","blackberry","cherry",
    "peach","pear","plum","apricot","nectarine",
    "coconut","pomegranate","guava","lychee","longan",
    "jackfruit","dragon fruit","passion fruit","tangerine","lime",
    "lemon","grapefruit","avocado","fig","date",
    "persimmon","starfruit","mulberry","cranberry","currant",
    "cantaloupe","honeydew","pomelo","sapodilla","rambutan",
    "mangosteen","soursop","tamarind","olive","quince"
  ]
};

const players = {};

let highScores = {};

if (fs.existsSync("scores.json")) {
  const raw = fs.readFileSync("scores.json");
  highScores = JSON.parse(raw);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomOptions(correct, arr) {
  const wrong = arr.filter(x => x !== correct);
  const shuffled = wrong.sort(() => 0.5 - Math.random());
  const wrong4 = shuffled.slice(0, 4);
  return [...wrong4, correct].sort(() => 0.5 - Math.random());
}

// 🔥 ดึงรูปจาก Pixabay
async function generateImage(keyword, category) {
  try {
    const query = `${keyword}`;

    const res = await axios.get("https://pixabay.com/api/", {
      params: {
        key: PIXABAY_KEY,
        q: query,
        image_type: "photo",
        safesearch: true,
        per_page: 5
      }
    });

    console.log("PIXABAY RESULT:", res.data.hits.length);

    if (!res.data.hits || res.data.hits.length === 0) {
      return "https://via.placeholder.com/400?text=No+Image";
    }

    const randomImage =
      res.data.hits[Math.floor(Math.random() * res.data.hits.length)];

    return randomImage.webformatURL;

  } catch (err) {
    console.log("PIXABAY ERROR FULL:", err.response?.data || err.message);
    return "https://via.placeholder.com/400?text=API+Error";
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
    highScore: highScores[name] || 0
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
    wrong: player.wrong,
    highScore: player.highScore
  });
});

app.post("/api/answer/:name", (req, res) => {
  const { name } = req.params;
  const { answer } = req.body;

  const player = players[name];
  if (!player) {
    return res.status(400).json({ error: "Player not found" });
  }

  let correct = false;

  if (answer === player.currentAnswer) {
    player.score++;
    correct = true;
  } else {
    player.wrong++;
  }

  // ✅ บันทึกคะแนนสูงสุด (ใส่ตรงนี้ 🔥)
  if (player.score > player.highScore) {
    player.highScore = player.score;
    highScores[name] = player.score;

    fs.writeFileSync("scores.json", JSON.stringify(highScores, null, 2));
  }

  if (player.wrong >= 5) {
    return res.json({
      correct,
      correctAnswer: player.currentAnswer,
      gameOver: true,
      finalScore: player.score,
      highScore: player.highScore
    });
  }

  res.json({
    correct,
    correctAnswer: player.currentAnswer,
    score: player.score,
    wrong: player.wrong
  });
});

/* ========================= */

const PORT = process.env.PORT || 7777;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});