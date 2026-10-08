const { GoogleGenAI } = require('@google/genai');
let cachedKey, client;
function getConfig() {
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim();
  const timeout = Number(process.env.AI_TIMEOUT_MS || 20000);
  if (!key || !model || !Number.isInteger(timeout) || timeout < 1 || timeout > 60000) return null;
  if (!client || key !== cachedKey) {
    client = new GoogleGenAI({ apiKey: key });
    cachedKey = key;
  }
  return { client, model, timeout };
}
module.exports = { getConfig };
