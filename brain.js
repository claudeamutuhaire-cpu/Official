const { Groq } = require('groq-sdk');
const { ChromaClient } = require('chroma');
const uuid = require('uuid');

const groq = new Groq({ apiKey: 'your_groq_api_key_here' }); // replace with real key

const chroma = new ChromaClient();
let collection;

async function initDB() {
  collection = await chroma.getOrCreateCollection({ name: "hunt_arts_faq" });
  // Seed some starter FAQs (add more real ones later)
  await collection.add({
    ids: [uuid.v4(), uuid.v4(), uuid.v4()],
    documents: [
      "Basic retouch price? → UGX 30k. Half upfront MoMo.",
      "Pro glow-up? → UGX 100k. Skin smooth, eyes pop, full fire."
    , "NSFW edits? → Discreet savage. Quote first, no weak shit."
    ]
  });
}

const userMemory = new Map(); // jid → { history: [] }

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

  if (!userMemory.has(jid)) userMemory.set(jid, { history: [] });

  const mem = userMemory.get(jid);
  mem.history.push({ role: "user", content: text });
  if (mem.history.length > 10) mem.history.shift(); // keep recent 10

  const results = await collection.query({ query_texts: [text], n_results: 3 });
  const context = results.documents[0].map(doc => `FAQ: ${doc}`).join('\n');

  const prompt = `You are Hunt Beast — bold, slangy, Luganda/English mix, zero fluff, emojis heavy: 🔥💀🔪📸.
Short replies: 1-3 sentences max. Aggressive hunter tone: "target acquired", "prey locked", "weak detected".
Remember convo history. Use context if fits. Always push to payment/retainer.
History: \( {mem.history.map(m => ` \){m.role}: ${m.content}`).join('\n')}
Context: ${context || "none"}
User: ${text}
Reply:`;

  const response = await groq.chat.completions.create({
    messages: [{ role: "system", content: prompt }],
    model: "mixtral-8x7b-32768", // fast/cheap
    temperature: 0.8,
    max_tokens: 150
  });

  const reply = response.choices[0].message.content.trim();

  await sock.sendMessage(jid, { text: reply });

  mem.history.push({ role: "beast", content: reply });
}

module.exports = { initDB, handleMessage };
