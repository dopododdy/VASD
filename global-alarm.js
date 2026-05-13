// js/global-alarm.js
// ระบบแจ้งเตือน Emergency Call สำหรับ VASD
// ใช้ Supabase postgres_changes แทน broadcast เพื่อความน่าเชื่อถือ
// แจ้งเตือนหลายชั้น: เสียง + สั่น + พูด + Notification + Overlay เต็มจอ

import { supabase } from './supabase.js';

// ───── Config ─────
const STALE_SECONDS = 60;          // ไม่เตือนถ้า event เก่ากว่านี้ (กันเตือนค้างตอน reconnect)
const TTS_REPEAT_MS = 5000;        // พูดซ้ำทุกกี่ ms
const VIBRATION_PATTERN = [400, 200, 400, 200, 400, 200, 1000];

// ───── State ─────
let audioContext = null;
let activeAlarm = null; // { id, audio, vibHandle, ttsInterval, titleHandle }

// ═══════════════════════════════════════════
// AUDIO CONTEXT (ปลดล็อกครั้งเดียว ใช้ได้ตลอด)
// ═══════════════════════════════════════════
function ensureAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[VASD Alarm] AudioContext not supported', e);
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

// เปิดเผยให้ index.html เรียกตอน login (user gesture)
window.unlockAudioForAlarm = function () {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0; // เงียบสนิท
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
    console.log('[VASD Alarm] Audio unlocked');
  } catch (e) {}
};

// ดักการแตะหน้าจอใดๆ เพื่อปลดล็อก audio (เผื่อเข้าหน้าอื่นที่ไม่ใช่ index)
function setupGlobalAudioUnlock() {
  const unlock = () => {
    ensureAudioContext();
  };
  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

// ═══════════════════════════════════════════
// เสียงเตือน (Siren สังเคราะห์ ไม่ต้องมีไฟล์เสียง)
// ═══════════════════════════════════════════
function playAlarmSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return null;

  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = 'sawtooth';
    gain.gain.value = 0.3;
    oscillator.frequency.value = 600;
    oscillator.start();

    // สวีปความถี่ขึ้นลงให้เหมือนไซเรน
    let freq = 600;
    let goingUp = true;
    const freqInterval = setInterval(() => {
      if (goingUp) {
        freq += 80;
        if (freq >= 1200) goingUp = false;
      } else {
        freq -= 80;
        if (freq <= 600) goingUp = true;
      }
      try {
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
      } catch (e) {}
    }, 60);

    return { oscillator, freqInterval };
  } catch (e) {
    console.warn('[VASD Alarm] playAlarmSound failed', e);
    return null;
  }
}

function stopAlarmSound(audio) {
  if (!audio) return;
  clearInterval(audio.freqInterval);
  try { audio.oscillator.stop(); } catch (e) {}
}

// ═══════════════════════════════════════════
// Text-to-Speech ภาษาไทย
// ═══════════════════════════════════════════
function speakAlert(sender, role) {
  if (!('speechSynthesis' in window)) return;
  try {
    const msg = new SpeechSynthesisUtterance(`เรียกด่วน จาก ${sender} ตำแหน่ง ${role}`);
    msg.lang = 'th-TH';
    msg.rate = 0.95;
    msg.volume = 1.0;
    speechSynthesis.speak(msg);
  } catch (e) {}
}

// ═══════════════════════════════════════════
// สั่น (Vibration API - Android เท่านั้น)
// ═══════════════════════════════════════════
function startVibration() {
  if (!navigator.vibrate) return null;
  const tick = () => {
    try { navigator.vibrate(VIBRATION_PATTERN); } catch (e) {}
  };
  tick();
  return setInterval(tick, 3000);
}

function stopVibration(handle) {
  if (handle) clearInterval(handle);
  if (navigator.vibrate) {
    try { navigator.vibrate(0); } catch (e) {}
  }
}

// ═══════════════════════════════════════════
// Browser Notification (ทำงานแม้แท็บไม่ active)
// ═══════════════════════════════════════════
function showNotification(sender, role) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('🚨 EMERGENCY CALL', {
      body: `${sender} (${role}) — เรียกด่วน`,
      requireInteraction: true,
      tag: 'vasd-emergency',
      renotify: true
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {}
}

// ═══════════════════════════════════════════
// Title กระพริบในแท็บ
// ═══════════════════════════════════════════
function startTitleFlash() {
  const original = document.title;
  let flip = false;
  const interval = setInterval(() => {
    document.title = (flip = !flip) ? '🚨 EMERGENCY 🚨' : '⚠️ ตอบรับด่วน!';
  }, 600);
  return { interval, original };
}

function stopTitleFlash(handle) {
  if (!handle) return;
  clearInterval(handle.interval);
  document.title = handle.original;
}

// ═══════════════════════════════════════════
// Overlay เต็มจอ
// ═══════════════════════════════════════════
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showOverlay(call) {
  const existing = document.getElementById('vasd-emergency-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'vasd-emergency-overlay';
  overlay.innerHTML = `
    <div class="vasd-emerg-card">
      <div class="vasd-emerg-icon">🚨</div>
      <div class="vasd-emerg-title">EMERGENCY CALL</div>
      <div class="vasd-emerg-subtitle">เรียกด่วน — ต้องการสัตวแพทย์/อาจารย์</div>
      <div class="vasd-emerg-sender">
        <div class="vasd-emerg-label">ผู้เรียก</div>
        <div class="vasd-emerg-name">${escapeHtml(call.sender || '-')}</div>
        <div class="vasd-emerg-role">${escapeHtml(call.role || '-')}</div>
      </div>
      <div class="vasd-emerg-time">เวลา ${new Date(call.created_at).toLocaleTimeString('th-TH')}</div>
      <button class="vasd-emerg-ack-btn" id="vasd-ack-btn">
        ✅ รับทราบ กำลังไป
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('vasd-ack-btn').onclick = () => {
    acknowledgeAlarm(call.id);
  };
}

function removeOverlay() {
  const overlay = document.getElementById('vasd-emergency-overlay');
  if (overlay) overlay.remove();
}

// ═══════════════════════════════════════════
// Main: Trigger + Stop
// ═══════════════════════════════════════════
function triggerAlarm(call) {
  if (activeAlarm && activeAlarm.id === call.id) return; // ซ้ำ
  stopActiveAlarm();

  console.log('[VASD Alarm] Trigger:', call.sender, call.role);

  showOverlay(call);
  const audio = playAlarmSound();
  const vibHandle = startVibration();
  speakAlert(call.sender, call.role);
  const ttsInterval = setInterval(() => speakAlert(call.sender, call.role), TTS_REPEAT_MS);
  const titleHandle = startTitleFlash();
  showNotification(call.sender, call.role);

  activeAlarm = { id: call.id, audio, vibHandle, ttsInterval, titleHandle };
}

function stopActiveAlarm() {
  if (!activeAlarm) return;
  stopAlarmSound(activeAlarm.audio);
  stopVibration(activeAlarm.vibHandle);
  clearInterval(activeAlarm.ttsInterval);
  stopTitleFlash(activeAlarm.titleHandle);
  try { speechSynthesis.cancel(); } catch (e) {}
  removeOverlay();
  activeAlarm = null;
}

async function acknowledgeAlarm(callId) {
  const ackName = localStorage.getItem('vasd_user') || 'ไม่ทราบชื่อ';
  try {
    await supabase
      .from('vasd_emergency_call')
      .update({
        acknowledged_by: ackName,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', callId)
      .is('acknowledged_at', null);
  } catch (e) {
    console.warn('[VASD Alarm] ACK failed', e);
  }
  stopActiveAlarm();
}

// ═══════════════════════════════════════════
// CSS Injection
// ═══════════════════════════════════════════
function injectStyles() {
  if (document.getElementById('vasd-alarm-styles')) return;
  const style = document.createElement('style');
  style.id = 'vasd-alarm-styles';
  style.textContent = `
    #vasd-emergency-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(220, 38, 38, 0.92);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: vasdEmergPulse 0.8s ease-in-out infinite;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }
    @keyframes vasdEmergPulse {
      0%, 100% { background: rgba(220, 38, 38, 0.92); }
      50%      { background: rgba(127, 29, 29, 0.95); }
    }
    .vasd-emerg-card {
      background: #fff;
      border-radius: 24px;
      padding: 32px 28px;
      max-width: 420px; width: 100%;
      text-align: center;
      box-shadow: 0 25px 80px rgba(0,0,0,0.5);
      font-family: "Sarabun", sans-serif;
      animation: vasdEmergShake 0.5s ease;
    }
    @keyframes vasdEmergShake {
      0%, 100% { transform: translateX(0); }
      25%      { transform: translateX(-10px); }
      75%      { transform: translateX(10px); }
    }
    .vasd-emerg-icon {
      font-size: 80px; line-height: 1; margin-bottom: 8px;
      animation: vasdEmergBounce 1s ease infinite;
    }
    @keyframes vasdEmergBounce {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.15); }
    }
    .vasd-emerg-title {
      font-family: "Outfit", sans-serif;
      font-size: 32px; font-weight: 800; color: #dc2626;
      letter-spacing: 1px; line-height: 1.1;
    }
    .vasd-emerg-subtitle {
      font-size: 14px; color: #6b7280;
      margin-top: 4px; margin-bottom: 24px;
    }
    .vasd-emerg-sender {
      background: #fef2f2; border: 2px solid #fecaca;
      border-radius: 16px; padding: 16px; margin-bottom: 16px;
    }
    .vasd-emerg-label {
      font-size: 11px; color: #991b1b; letter-spacing: 1px;
      text-transform: uppercase; font-weight: 700;
    }
    .vasd-emerg-name {
      font-size: 26px; font-weight: 800; color: #111827; margin-top: 4px;
      word-break: break-word;
    }
    .vasd-emerg-role {
      font-size: 14px; color: #4b5563; margin-top: 2px;
    }
    .vasd-emerg-time {
      font-size: 12px; color: #9ca3af; margin-bottom: 20px;
      font-family: "Outfit", sans-serif;
    }
    .vasd-emerg-ack-btn {
      width: 100%;
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff; border: none;
      padding: 18px; border-radius: 14px;
      font-family: "Sarabun", sans-serif;
      font-size: 18px; font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
      transition: transform 0.15s;
    }
    .vasd-emerg-ack-btn:active { transform: scale(0.96); }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════
// Init
// ═══════════════════════════════════════════
async function init() {
  injectStyles();
  setupGlobalAudioUnlock();

  // Subscribe realtime
  try {
    supabase.channel('vasd-emergency-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vasd_emergency_call' },
        (payload) => {
          const call = payload.new;
          if (!call || !call.created_at) return;
          const ageSec = (Date.now() - new Date(call.created_at).getTime()) / 1000;
          if (ageSec > STALE_SECONDS) return; // เก่าเกินไป
          if (call.acknowledged_at) return;    // มีคน ack แล้ว
          triggerAlarm(call);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vasd_emergency_call' },
        (payload) => {
          // มีคน ack ที่เครื่องอื่น → หยุดเตือนเครื่องนี้ด้วย
          if (payload.new && payload.new.acknowledged_at &&
              activeAlarm && activeAlarm.id === payload.new.id) {
            stopActiveAlarm();
          }
        })
      .subscribe();
  } catch (e) {
    console.warn('[VASD Alarm] Realtime subscribe failed', e);
  }

  // เช็คว่ามี emergency ค้างอยู่หรือเปล่า (เผื่อเพิ่งเปิดหน้า)
  try {
    const cutoff = new Date(Date.now() - STALE_SECONDS * 1000).toISOString();
    const { data, error } = await supabase
      .from('vasd_emergency_call')
      .select('*')
      .gte('created_at', cutoff)
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (!error && data && data.length > 0) {
      triggerAlarm(data[0]);
    }
  } catch (e) {
    console.warn('[VASD Alarm] Initial check failed', e);
  }
}

init();
