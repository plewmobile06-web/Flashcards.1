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

/* ========================= DATA ========================= */

const data = {
  animal: ["cat","dog","lion","tiger","elephant","zebra","giraffe","monkey","panda","bear"],
  fruit: ["apple","banana","mango","orange","grape","pineapple","watermelon","papaya"]
};

const players = {};

let highScores = {};
if (fs.existsSync("scores.json")) {
  highScores = JSON.parse(fs.readFileSync("scores.json"));
}

/* ========================= FUNCTION ========================= */

function randomItem(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

function randomOptions(correct, arr){
  const wrong = arr.filter(x=>x!==correct);
  const shuffled = wrong.sort(()=>0.5-Math.random());
  const wrong4 = shuffled.slice(0,4);
  return [...wrong4, correct].sort(()=>0.5-Math.random());
}

async function generateImage(keyword){
  try{
    const res = await axios.get("https://pixabay.com/api/",{
      params:{
        key: PIXABAY_KEY,
        q: keyword,
        image_type:"photo",
        safesearch:true,
        per_page:5
      }
    });

    if(!res.data.hits.length){
      return "https://via.placeholder.com/400?text=No+Image";
    }

    return res.data.hits[Math.floor(Math.random()*res.data.hits.length)].webformatURL;

  }catch{
    return "https://via.placeholder.com/400?text=Error";
  }
}

/* ========================= ROUTES ========================= */

app.post("/api/start",(req,res)=>{
  const { name, category } = req.body;

  if(!data[category]){
    return res.status(400).json({error:"Invalid category"});
  }

  players[name]={
    score:0,
    wrong:0,
    category,
    highScore: highScores[name] || 0
  };

  res.json({message:"Game started"});
});

app.get("/api/question/:name", async (req,res)=>{
  const { name } = req.params;
  const player = players[name];

  if(!player){
    return res.status(400).json({error:"Player not found"});
  }

  if(player.wrong >=5){
    return res.json({
      gameOver:true,
      finalScore:player.score,
      highScore:player.highScore
    });
  }

  const items = data[player.category];
  const correct = randomItem(items);
  const image = await generateImage(correct);
  const options = randomOptions(correct, items);

  player.currentAnswer = correct;

  res.json({
    image,
    options,
    score:player.score,
    wrong:player.wrong,
    highScore:player.highScore
  });
});

app.post("/api/answer/:name",(req,res)=>{
  const { name } = req.params;
  const { answer } = req.body;

  const player = players[name];
  if(!player){
    return res.status(400).json({error:"Player not found"});
  }

  let correct = false;

  if(answer === player.currentAnswer){
    player.score++;
    correct = true;
  }else{
    player.wrong++;
  }

  // 🔥 บันทึกคะแนนสูงสุด
  if(player.score > player.highScore){
    player.highScore = player.score;
    highScores[name] = player.score;
    fs.writeFileSync("scores.json", JSON.stringify(highScores,null,2));
  }

  if(player.wrong >=5){
    return res.json({
      correct,
      correctAnswer:player.currentAnswer,
      gameOver:true,
      finalScore:player.score,
      highScore:player.highScore
    });
  }

  res.json({
    correct,
    correctAnswer:player.currentAnswer,
    score:player.score,
    wrong:player.wrong
  });
});

/* ✅ ranking ต้องอยู่นอก answer */

app.get("/api/ranking",(req,res)=>{
  const ranking = Object.entries(highScores)
    .map(([name,score])=>({name,score}))
    .sort((a,b)=>b.score-a.score);

  res.json(ranking);
});

/* ========================= START SERVER ========================= */

app.listen(3000,()=>{
  console.log("Server running on http://localhost:3000");
});