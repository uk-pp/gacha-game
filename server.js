const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

const ITEMS = [
  { id: "target", name: "0.0001%", rate: 0.0001, target: true },
  { id: "super", name: "1%", rate: 1, target: false },
  { id: "rare", name: "13.9999%", rate: 13.9999, target: false },
  { id: "normal", name: "85%", rate: 85, target: false }
];

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {};

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getPlayer(data, ip) {
  if (!data[ip]) {
    data[ip] = {
      total: 0,
      rateCounts: {},
      completed: false
    };
  }

  if (!data[ip].rateCounts) data[ip].rateCounts = {};
  if (typeof data[ip].total !== "number") data[ip].total = 0;
  if (typeof data[ip].completed !== "boolean") data[ip].completed = false;

  return data[ip];
}

function drawItem() {
  const r = Math.random() * 100;
  let sum = 0;

  for (const item of ITEMS) {
    sum += item.rate;

    if (r < sum) {
      return item;
    }
  }

  return ITEMS[ITEMS.length - 1];
}

app.use(express.json());

/* GitHubではファイルを全部ルートに置いているので、ここを__dirnameにする */
app.use(express.static(__dirname));

app.get("/api/status", (req, res) => {
  const data = loadData();
  const player = getPlayer(data, getIp(req));

  res.json({
    totalDraws: player.total,
    rateCounts: player.rateCounts,
    completed: player.completed
  });
});

app.post("/api/draw", (req, res) => {
  const data = loadData();
  const ip = getIp(req);
  const player = getPlayer(data, ip);

  /* 0.0001%を引いた後はもう引けない */
  if (player.completed) {
    return res.json({
      completed: true,
      totalDraws: player.total,
      rateCounts: player.rateCounts
    });
  }

  const item = drawItem();

  player.total++;

  const key = String(item.rate);
  player.rateCounts[key] = (player.rateCounts[key] || 0) + 1;

  if (item.target === true) {
    player.completed = true;

    if (!data._winners) {
      data._winners = [];
    }

    data._winners.push({
      number: data._winners.length + 1,
      draws: player.total,
      date: new Date().toISOString()
    });
  }

  saveData(data);

  res.json({
    item,
    totalDraws: player.total,
    rateCounts: player.rateCounts,
    completed: player.completed
  });
});

app.get("/api/winners", (req, res) => {
  const data = loadData();

  res.json(data._winners || []);
});

app.listen(PORT, () => {
  console.log(`Gacha game running on port ${PORT}`);
});
