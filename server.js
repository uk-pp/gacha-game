const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const ITEMS = [
  { id: "target", name: "0.0001%", rate: 0.0001, target: true },
  { id: "super", name: "1%", rate: 1, target: false },
  { id: "rare", name: "13.9999%", rate: 13.9999, target: false },
  { id: "normal", name: "85%", rate: 85, target: false }
];

app.use(express.json());

/* Renderのプロキシ越しでもIPを取得 */
app.set("trust proxy", 1);

/* GitHubではファイルを全部ルートに置いている */
app.use(express.static(__dirname));

function getIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_SECRET_KEY,
      "Authorization": `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error: ${response.status} ${text}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
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

/* プレイヤー取得 */
async function getPlayer(ip) {
  const rows = await supabaseRequest(
    `gacha_players?ip=eq.${encodeURIComponent(ip)}&limit=1`
  );

  if (rows.length > 0) {
    const player = rows[0];

    if (!player.rate_counts) player.rate_counts = {};
    if (typeof player.total !== "number") player.total = 0;
    if (typeof player.completed !== "boolean") player.completed = false;

    return player;
  }

  const newPlayer = {
    ip,
    total: 0,
    rate_counts: {},
    completed: false
  };

  const created = await supabaseRequest("gacha_players", {
    method: "POST",
    body: JSON.stringify(newPlayer)
  });

  return created[0];
}

/* 現在の状態 */
app.get("/api/status", async (req, res) => {
  try {
    const player = await getPlayer(getIp(req));

    res.json({
      totalDraws: player.total,
      rateCounts: player.rate_counts,
      completed: player.completed
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "データ取得に失敗しました" });
  }
});

/* ガチャ */
app.post("/api/draw", async (req, res) => {
  try {
    const ip = getIp(req);
    const player = await getPlayer(ip);

    /* 0.0001%達成後はもう引けない */
    if (player.completed) {
      return res.json({
        completed: true,
        totalDraws: player.total,
        rateCounts: player.rate_counts
      });
    }

    const item = drawItem();

    const newTotal = player.total + 1;

    const rateCounts = {
      ...(player.rate_counts || {})
    };

    const key = String(item.rate);
    rateCounts[key] = (rateCounts[key] || 0) + 1;

    const completed = item.target === true;

    /* プレイヤー情報を更新 */
    await supabaseRequest(
      `gacha_players?ip=eq.${encodeURIComponent(ip)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          total: newTotal,
          rate_counts: rateCounts,
          completed
        })
      }
    );

    /* 0.0001%達成者を記録 */
    if (completed) {
      await supabaseRequest("gacha_winners", {
        method: "POST",
        body: JSON.stringify({
          draws: newTotal
        })
      });
    }

    res.json({
      item,
      totalDraws: newTotal,
      rateCounts,
      completed
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "ガチャ処理に失敗しました"
    });
  }
});

/* 殿堂入り一覧 */
async function getWinners(res) {
  try {
    const winners = await supabaseRequest(
      "gacha_winners?select=id,draws,created_at&order=id.asc"
    );

    const records = winners.map((winner, index) => ({
      number: index + 1,
      draws: winner.draws,
      date: winner.created_at
    }));

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "殿堂入り記録の取得に失敗しました"
    });
  }
}

/* 現在のフロント用 */
app.get("/api/winners", async (req, res) => {
  await getWinners(res);
});

/* 以前のフロントにも対応 */
app.get("/api/records", async (req, res) => {
  await getWinners(res);
});

app.listen(PORT, () => {
  console.log(`Gacha game running on port ${PORT}`);
});
