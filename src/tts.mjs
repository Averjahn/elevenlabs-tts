#!/usr/bin/env node

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const API_BASE = "https://api.elevenlabs.io/v1";

const apiKey = process.env.ELEVENLABS_API_KEY;
const envVoiceId = process.env.VOICE_ID;

/*
 * Модель:
 * - по умолчанию используем eleven_v3 — новую многоязычную модель с лучшим качеством произношения;
 * - можно переопределить через MODEL_ID в .env.
 */
const modelId = process.env.MODEL_ID || "eleven_v3";

if (!apiKey) {
  console.error("Missing ELEVENLABS_API_KEY in .env");
  process.exit(1);
}

function parseArgValue(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith("-")) return null;
  return val;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeRussianText(text) {
  let t = text.trim();

  if (!/[.!?]$/.test(t)) {
    t += ".";
  }

  return t;
}

async function textToSpeech(text, options = {}, attempt = 1) {

  const vid = options.voiceId || voiceId;
  const effectiveModelId = options.modelId || modelId;

  // Для eleven_v3 параметр optimize_streaming_latency не поддерживается.
  const baseUrl = `${API_BASE}/text-to-speech/${vid}`;
  const urlParams =
    effectiveModelId === "eleven_v3"
      ? `?output_format=mp3_44100_128`
      : `?output_format=mp3_44100_128&optimize_streaming_latency=0`;

  const url = `${baseUrl}${urlParams}`;

  const normalizedText = normalizeRussianText(text);

  try {

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
        "User-Agent": "node-elevenlabs-tts/1.0"
      },
      body: JSON.stringify({
        text: normalizedText,
        model_id: effectiveModelId,
        // Явно указываем русский язык для multilingual‑модели
        language_code: options.languageCode || "ru",
        voice_settings: {
          // Чуть более «ровное» и предсказуемое произношение
          stability: 0.7,
          similarity_boost: 0.95,
          style: 0.05,
          use_speaker_boost: true,
        },
      })
    });

    if (!res.ok) {

      const err = await res.text();

      if (attempt < 3) {
        console.log(`Retry ${attempt}...`);
        await sleep(1500);
        return textToSpeech(text, options, attempt + 1);
      }

      throw new Error(`ElevenLabs API ${res.status}: ${err}`);
    }

    return Buffer.from(await res.arrayBuffer());

  } catch (e) {

    if (attempt < 3) {
      console.log(`Retry ${attempt}...`);
      await sleep(1500);
      return textToSpeech(text, options, attempt + 1);
    }

    throw e;
  }
}

async function runBatch() {

  const configPath = path.join(__dirname, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  const { outputDir = "output", prompts, voices } = config;

  const args = process.argv.slice(2);
  const voicePreset = parseArgValue(args, "--voice");
  const voiceIdArg = parseArgValue(args, "--voice-id");

  const selectedVoiceId =
    voiceIdArg ||
    (voicePreset && voices && typeof voices === "object" ? voices[voicePreset] : null) ||
    envVoiceId;

  if (!selectedVoiceId) {
    console.error(
      [
        "Missing VOICE_ID.",
        "Укажите либо VOICE_ID в .env, либо флаг:",
        "  --voice ru1|ru2|ru3 (смотри src/config.json -> voices)",
        "  --voice-id <voiceId>",
      ].join("\n"),
    );
    process.exit(1);
  }

  const outDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(__dirname, "..", outputDir);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Prompts: ${prompts.length}\n`);

  for (const item of prompts) {

    const text = (item.text || item.prompt || "").trim();

    if (!text) {
      console.log(`Skip ${item.id}: empty`);
      continue;
    }

    try {

      process.stdout.write(`[${item.id}] Synthesizing... `);

      const audio = await textToSpeech(text, { voiceId: selectedVoiceId });

      const outPath = path.join(outDir, `${item.id}.mp3`);

      fs.writeFileSync(outPath, audio);

      console.log(`Saved ${audio.length} bytes`);

      await sleep(800);

    } catch (err) {

      console.log(`ERROR`);
      console.error(err.message);
    }
  }

  console.log(`\nDone. Output: ${outDir}`);
}

async function main() {

  const args = process.argv.slice(2);

  if (args.includes("--batch") || args.includes("-b")) {
    await runBatch();
    return;
  }

  const voiceIdArg = parseArgValue(args, "--voice-id");
  const voiceId = voiceIdArg || envVoiceId;

  if (!voiceId) {
    console.error(
      [
        "Missing VOICE_ID.",
        "Укажите либо VOICE_ID в .env, либо флаг:",
        "  --voice-id <voiceId>",
      ].join("\n"),
    );
    process.exit(1);
  }

  let text = "";
  let outPath = "output.mp3";

  if (args.length > 0) {

    const oIdx = args.indexOf("-o");

    if (oIdx !== -1 && args[oIdx + 1]) {
      outPath = args[oIdx + 1];
      args.splice(oIdx, 2);
    }

    text = args.join(" ").trim();
  }

  if (!text && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    text = Buffer.concat(chunks).toString("utf8");
  }

  if (!text) {
    console.error("Usage:");
    console.error("node src/tts.mjs \"Your text\"");
    console.error("node src/tts.mjs --batch");
    process.exit(1);
  }

  const outDir = path.dirname(outPath);

  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log("Synthesizing...");

  const audio = await textToSpeech(text, { voiceId });

  fs.writeFileSync(outPath, audio);

  console.log(`Saved: ${path.resolve(outPath)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});