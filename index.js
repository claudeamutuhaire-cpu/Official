const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const sharp = require('sharp');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Persistent state
const adapter = new JSONFile('states.json');
const db = new Low(adapter);
await db.read();
db.data ||= { users: {} };
const userStates = db.data.users;

async function saveStates() { await db.write(); }

async function startBeast() {
  const { state, saveCreds } = await useMultiFileAuthState('hunt_auth');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['Hunt Arts Beast', 'Chrome', '130.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection dropped 💀 Reconnecting?', shouldReconnect);
      if (shouldReconnect) startBeast();
    } else if (connection === 'open') {
      console.log('Beast online — targets acquired 🔥🔪');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();

    if (!userStates[jid]) userStates[jid] = { step: 'idle' };
    await saveStates();

    // Menu trigger
    if (text.match(/hi|start|hey|oyee|munno/) || userStates[jid].step === 'idle') {
      await sock.sendMessage(jid, {
        text: 'Target acquired munno 🎯 Weak today? What we hunting? 📸💀',
        footer: 'Hunt Arts — trash pics die here',
        buttons: [
          { buttonId: 'edit', buttonText: { displayText: 'Photo Edit 🔥' }, type: 1 },
          { buttonId: 'bot', buttonText: { displayText: 'Get Savage Bot 🤖' }, type: 1 },
          { buttonId: 'web', buttonText: { displayText: 'Website/Domain Quote 🌐' }, type: 1 },
          { buttonId: 'portfolio', buttonText: { displayText: 'View Kills Portfolio' }, type: 1 },
          { buttonId: 'human', buttonText: { displayText: 'Summon Hunter 💀' }, type: 1 }
        ]
      });
      userStates[jid].step = 'menu';
      await saveStates();
      return;
    }

    // Handle buttons
    if (msg.message?.buttonsResponseMessage) {
      const btn = msg.message.buttonsResponseMessage.selectedButtonId;

      if (btn === 'edit') {
        await sock.sendMessage(jid, { text: 'Lock & load. Send that trash pic — I\'ll turn garbage to matooke-fresh masterpiece 🔥 Tulina okuhunt!' });
        userStates[jid].step = 'await_photo';
      } else if (btn === 'portfolio') {
        // Drop portfolio images (replace URLs with your hosted ones)
        await sock.sendMessage(jid, {
          image: { url: 'https://i.imgur.com/your_before_after1.jpg' },
          caption: 'Weak prey → Killed 🔥 More? Reply MOREKILLS',
          footer: 'Hunt Arts portfolio'
        });
        // Add sequential sends or album if you want carousel
      } else if (btn === 'human') {
        await sock.sendMessage(jid, { text: 'Hunter summoned. Hold for real talk munno 💀' });
        // Optional: sock.sendMessage('your_number@s.whatsapp.net', { text: `Client ${jid} wants human` });
      }
      await saveStates();
    }

    // Photo handler
    if (msg.message?.imageMessage && userStates[jid].step === 'await_photo') {
      try {
        const buffer = await sock.downloadMediaMessage(msg);
        const preview = await sharp(buffer)
          .resize(512)
          .composite([{ input: Buffer.from('Hunt Arts Preview - Pay for Full'), gravity: 'southeast', tile: false }])
          .jpeg({ quality: 70 })
          .toBuffer();

        await sock.sendMessage(jid, {
          image: preview,
          caption: 'Prey locked. Weak as hell. Pick your slaughter:',
          buttons: [
            { buttonId: 'basic_30k', buttonText: { displayText: 'Basic Retouch 30k UGX' }, type: 1 },
            { buttonId: 'pro_100k', buttonText: { displayText: 'Pro Glow-Up 100k UGX' }, type: 1 },
            { buttonId: 'comm_250k', buttonText: { displayText: 'Commercial Kill 250k UGX' }, type: 1 }
          ]
        });
        userStates[jid].step = 'await_choice';
        await saveStates();
      } catch (e) { console.log('Image hunt failed', e); }
    }

    // Payment push on choice
    if (msg.message?.buttonsResponseMessage) {
      const btn = msg.message.buttonsResponseMessage.selectedButtonId;
      let amount = 0;
      if (btn.includes('pro_100k')) amount = 100000;
      else if (btn.includes('basic_30k')) amount = 30000;
      else if (btn.includes('comm_250k')) amount = 250000;

      if (amount > 0) {
        const half = amount / 2;
        userStates[jid].amount = amount;
        userStates[jid].step = 'await_pay';

        await sock.sendMessage(jid, {
          text: `Kill selected 💀 Half upfront UGX ${half} to execute the hunt. Pay Airtel Money now — masterpiece drops boda-fast.`,
          buttons: [
            { buttonId: 'pay_airtel', buttonText: { displayText: 'Pay Half Now 🔥' }, type: 1 },
            { buttonId: 'paid_proof', buttonText: { displayText: 'I Paid (send proof)' }, type: 1 }
          ]
        });
        // Later: integrate real Airtel initiatePayment here when keys ready
        // For now: user sends screenshot or replies 'paid'
      }
    }

    // Paid confirmation
    if (text.includes('paid') || text.includes('proof') || userStates[jid].step === 'await_pay') {
      await sock.sendMessage(jid, { text: 'Payment hunt confirmed. Carving masterpiece now — stay locked 🔥 Delivery in <1h.' });
      userStates[jid].step = 'processing';
      await saveStates();
      // Notify yourself: sock.sendMessage('your_jid', { text: `New payment from ${jid} - ${userStates[jid].amount} UGX` });
    }

    // Fallback savage
    if (userStates[jid].step !== 'idle' && !text.match(/menu|human|paid/)) {
      await sock.sendMessage(jid, { text: 'Hunt stalled munno? Reply MENU or HUMAN 💀 No weak vibes here.' });
    }
  });
}

startBeast().catch(err => console.log('Beast crashed', err));
