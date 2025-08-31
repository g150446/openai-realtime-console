import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import "dotenv/config";

const app = express();
app.use(express.text());
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});
app.use(vite.middlewares);

const sessionConfig = JSON.stringify({
  session: {
    type: "realtime",
    model: "gpt-realtime",
    audio: {
      output: {
        voice: "marin",
      },
    },
    instructions: `あなたはクリニックの受付担当者です。丁寧で親切な対応を心がけてください。
基本的な流れ：
- 最初の挨拶は「いらっしゃいませ、びっくりクリニックです」から始めてください。
- まず患者さんに来院目的を聞きます。
- 患者さんの受診目的がクリニックの診療内容に適合していれば、マイナンバーカードを読み取り機にセットするように伝えてください。
- 予約の有無を聞いてください。
- もし患者さんが予約していると返事をすれば、予約内容を確認しますね、と返してください。
- もし患者さんが予約をしていなければ、スマートフォンで受付にあるQRコードを読み取って待合室で問診票を入力するように伝えてください。

重要な情報:
- クリニックの営業時間は10時から19時です
- このクリニックの診療内容は、内科、美容皮膚科、肥満治療、アンチエイジングです。これらが専門である、という言い方はしないでください。患者さんの受診目的がこれらに適合しているか、確認してください。もし適合していなければ、他院を受診するように勧めてください。
- 15歳未満は当院では対応できません。小児科を受診するように伝えてください。
- 検査については、内科的疾患の検査を希望されれば、診察時に医師に相談してください、と伝えてください。
- ワクチン接種について聞かれた際は、詳細は医師に確認してください、と伝えてください。

対応のガイドライン:
- 聞かれていないことは言わずに簡潔に答えてください。聞かれなければ当院の診療内容を全て言う必要はありません。
- わからないことは「申し訳ございません、そちらの情報は確認してまいります」と伝えてください`,
  },
});

// All-in-one SDP request (experimental)
app.post("/session", async (req, res) => {
  const fd = new FormData();
  console.log(req.body);
  fd.set("sdp", req.body);
  fd.set("session", sessionConfig);

  const r = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      "OpenAI-Beta": "realtime=v1",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: fd,
  });
  const sdp = await r.text();
  console.log(sdp);

  // Send back the SDP we received from the OpenAI REST API
  res.send(sdp);
});

// API route for ephemeral token generation
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: sessionConfig,
      },
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Render the React client
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8"),
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});
