const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Error handling to log crashes
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT BEAST CRASH:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// Run everything in async IIFE for awaits
(async () => {
  // Persistent states
  const adapter = new JSONFile('states.json');
  const db = new Low(adapter);
  await db.read();
  db.data ||= { users: {} };
  const userStates = db.data.users;

  async function saveStates() {
    await db.write();
  }

  // Human delay anti-ban
  async function humanDelay(min = 1000, extra = 2000) {
    const time = min + Math.random() * extra;
    await new Promise(r => setTimeout(r, time));
  }

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
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.log('QR Code for scan:', qr);
      }
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Connection dropped 💀 Reconnecting?', shouldReconnect);
        if (shouldReconnect) startBeast();
      } else if (connection === 'open') {
        console.log('Hunt Arts Beast online 🔥💀🔪 Targets locked');
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const jid = msg.key.remoteJid;
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();

      if (!userStates[jid]) userStates[jid] = { step: 'idle' };
      await saveStates();

      await humanDelay();

      if (text.match(/hi|start|hey|oyee|munno/) || userStates[jid].step === 'idle') {
        await sock.sendMessage(jid, {
          text: 'Target acquired munno 🎯 Weak pic today? What we hunting? 📸💀',
          footer: 'Hunt Arts — trash dies here',
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

      if (msg.message?.buttonsResponseMessage) {
        const btn = msg.message.buttonsResponseMessage.selectedButtonId;

        await humanDelay();

        if (btn === 'edit') {
          await sock.sendMessage(jid, { text: 'Lock loaded. Send that weak trash pic — matooke-fresh masterpiece coming 🔥 Tulina okuhunt!' });
          userStates[jid].step = 'await_photo';
        } else if (btn === 'portfolio') {
          await sock.sendMessage(jid, {
            image: { url: 'https://i.imgur.com/YOUR_BEFORE_AFTER.jpg' },
            caption: 'Weak → Killed 🔥 Reply MORE for next',
            footer: 'Hunt Arts portfolio'
          });
        } else if (btn === 'human') {
          await sock.sendMessage(jid, { text: 'Hunter summoned. Hold tight munno — real talk incoming 💀' });
        }
        await saveStates();
      }

      if (msg.message?.imageMessage && userStates[jid].step === 'await_photo') {
        try {
          await humanDelay(2000);
          const buffer = await sock.downloadMediaMessage(msg);

          // Sharp bypassed - raw preview
          await sock.sendMessage(jid, {
            image: buffer,
            caption: 'Prey locked. Weak as fuck detected. Choose slaughter (raw preview - watermark off for now):',
            buttons: [
              { buttonId: 'basic_30k', buttonText: { displayText: 'Basic Retouch 30k UGX' }, type: 1 },
              { buttonId: 'pro_100k', buttonText: { displayText: 'Pro Glow-Up 100k UGX' }, type: 1 },
              { buttonId: 'comm_250k', buttonText: { displayText: 'Commercial Kill 250k UGX' }, type: 1 }
            ]
          });
          userStates[jid].step = 'await_choice';
          await saveStates();
        } catch (e) {
          console.error('Image hunt failed', e);
          await sock.sendMessage(jid, { text: 'Pic hunt glitched 💀 Send again or HUMAN' });
        }
      }

      if (msg.message?.buttonsResponseMessage) {
        const btn = msg.message.buttonsResponseMessage.selectedButtonId;
        let amount = 0;
        if (btn === 'basic_30k') amount = 30000;
        if (btn === 'pro_100k') amount = 100000;
        if (btn === 'comm_250k') amount = 250000;

        if (amount > 0) {
          await humanDelay();
          const half = amount / 2;
          userStates[jid].amount = amount;
          userStates[jid].step = 'await_pay';

          await sock.sendMessage(jid, {
            text: `Kill selected 💀 Half upfront UGX ${half} to execute. Pay Airtel Money now — masterpiece drops boda-fast. Reply 'paid' after.`,
            buttons: [
              { buttonId: 'pay_airtel', buttonText: { displayText: 'Pay Half Now 🔥' }, type: 1 },
              { buttonId: 'paid_proof', buttonText: { displayText: 'I Paid (send proof)' }, type: 1 }
            ]
          });
        }
      }

      if (text.includes('paid') || text.includes('proof') || userStates[jid].step === 'await_pay') {
        await humanDelay();
        await sock.sendMessage(jid, { text: 'Payment spotted. Hunting now — masterpiece incoming soon 🔥 Stay locked munno.' });
        userStates[jid].step = 'processing';
        await saveStates();
      }

      if (userStates[jid].step !== 'idle' && !text.match(/menu|human|paid/)) {
        await sock.sendMessage(jid, { text: 'Hunt stalled? Reply MENU or HUMAN 💀 No weak energy.' });
      }
    });
  }

  startBeast().catch(err => console.error('Beast startup crash:', err));
})();
