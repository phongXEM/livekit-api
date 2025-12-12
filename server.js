import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodingOptionsPreset,
  RoomServiceClient,
} from "livekit-server-sdk";

const app = express();
app.use(cors());
app.use(express.json());

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitHost = process.env.LIVEKIT_URL || "https://livekit.tvphapluat.com";

app.post("/token", async (req, res) => {
  try {
    const { roomName, identity, name } = req.body;

    if (!roomName || !identity) {
      return res.status(400).json({ error: "roomName and identity are required" });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || identity,
      ttl: "1h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await at.toJwt();   // <-- QUAN TRỌNG
    return res.json({ urlWebRTC: "wss://livekit.tvphapluat.com", tokenRoom: jwt });
  } catch (e) {
    console.error("token error:", e);
    return res.status(500).json({ error: "failed to generate token" });
  }
});

// --- EGRESS API ---
const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);
const egressClient = new EgressClient(livekitHost, apiKey, apiSecret);

// Start record gộp room (composite)
app.post("/egress/start", async (req, res) => {
  try {
    const { roomName, layout = "grid" } = req.body;
    if (!roomName) return res.status(400).json({ error: "roomName required" });

    // 1) Kiểm tra room có tồn tại chưa
    const rooms = await roomService.listRooms([roomName]);
    if (!rooms || rooms.length === 0) {
      // 2) Tạo room rỗng trước
      await roomService.createRoom({ name: roomName });
      // tạo room xong vẫn chưa có track, nhưng egress sẽ start được
    }

    const fileOutput = new EncodedFileOutput({
      fileType: "MP4",
      filepath: `/out/${roomName}-${Date.now()}.mp4`,
    });

    const info = await egressClient.startRoomCompositeEgress(
      roomName,
      layout,
      fileOutput,
      { preset: EncodingOptionsPreset.H264_720P_30 }
    );

    return res.json({ egressId: info.egressId, info });
  } catch (e) {
    console.error("egress start error:", e);
    return res.status(500).json({ error: "failed to start egress" });
  }
});

// Stop record
app.post("/egress/stop", async (req, res) => {
  try {
    const { egressId } = req.body;
    if (!egressId) {
      return res.status(400).json({ error: "egressId required" });
    }

    const info = await egressClient.stopEgress(egressId); // :contentReference[oaicite:4]{index=4}
    return res.json(info);
  } catch (e) {
    console.error("egress stop error:", e);
    return res.status(500).json({ error: "failed to stop egress" });
  }
});

app.listen(3000, () => console.log("Token server on :3000"));
