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
app.set("trust proxy", 1);
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

async function getPlayer(ip) {
  const rows = await supabaseRequest(
    `gacha_players?ip=eq.${encodeURIComponent(ip)}&limit=1`
  );

  if (rows.length > 0) {
    return rows[0];
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

app.get("/api/status", async (req, res) => {
  try {
    const player = await getPlayer(getIp(req));

    res.json({
      totalDraws: player.total,
      rateCounts: player.rate_counts || {},
      completed: player.completed
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "データ取得に失敗しました"
    });
  }
});

app.post("/api/draw", async (req, res) => {
  try {
    const ip = getIp(req);

    /*
      DB側の関数で「1回引く＝必ず1回加算」を行う。
      同時に複数回リクエストされても累計が戻らない。
    */

    const player = await getPlayer(ip);

    if (player.completed) {
      return res.json({
        completed: true,
        totalDraws: player.total,
        rateCounts: player.rate_counts || {}
      });
    }

    const item = drawItem();
    const key = String(item.rate);
    const completed = item.target === true;

    const result = await supabaseRequest(
      "rpc/increment_gacha_player",
      {
        method: "POST",
        body: JSON.stringify({
          p_ip: ip,
          p_rate: key,
          p_completed: completed
        })
      }
    );

    const totalDraws = result.total;
    const rateCounts = result.rate_counts || {};

    if (completed) {
      await supabaseRequest("gacha_winners", {
        method: "POST",
        body: JSON.stringify({
          draws: totalDraws
        })
      });
    }

    res.json({
      item,
      totalDraws,
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

app.get("/api/winners", async (req, res) => {
  await getWinners(res);
});

app.get("/api/records", async (req, res) => {
  await getWinners(res);
});

app.listen(PORT, () => {
  console.log(`Gacha game running on port ${PORT}`);
});
