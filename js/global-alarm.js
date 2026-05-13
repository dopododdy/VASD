// js/global-alarm.js — v2
// VASD Emergency Call Alert System
// แก้ไข: บั๊ก AudioContext.resume ไม่ได้ await + เพิ่ม "Enable Sound" banner

import { supabase } from './supabase.js';

const STALE_SECONDS = 60;
const TTS_REPEAT_MS = 5000;
const VIBRATION_PATTERN = [400, 200, 400, 200, 400, 200, 1000];
const AUDIO_ENABLED_KEY = 'vasd_audio_enabled';

let audioContext = null;
let activeAlarm = null;

console.log('[VASD Alarm v2] global-alarm.js loaded');

// ═══════════════════════════════════════════
// AudioContext — สร้างครั้งเดียว, await resume ทุกครั้ง
// ═══════════════════════════════════════════
async function ensureAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[VASD Alarm] AudioContext created, state =', audioContext.state);
    } catch (e) {
      console.warn('[VASD Alarm] AudioContext unsupported', e);
      return null;
    }
  }
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
      console.log('[VASD Alarm] AudioContext after resume, state =', audioContext.state);
    } catch (e) {
      console.warn('[VASD Alarm] resume() failed', e);
    }
  }
  return audioContext;
}

async function unlockAudio() {
  const ctx = await ensureAudioContext();
  if (!ctx || ctx.state !== 'running') return false;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0; // เงียบสนิท
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
    return true;
  } catch (e) {
    return false;
  }
}

window.unlockAudioForAlarm = unlockAudio;

// ═══════════════════════════════════════════
// Enable Sound Banner — กดครั้งเดียวต่อเครื่อง
// ═══════════════════════════════════════════
function showEnableBanner() {
  if (document.getElementById('vasd-enable-banner')) return;
  if (localStorage.getItem(AUDIO_ENABLED_KEY) === 'yes') return;

  const banner = document.createElement('div');
  banner.id = 'vasd-enable-banner';
  banner.innerHTML = `
    <span style="font-size: 22px;">🔇</span>
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 700; color: #fff; font-size: 13px;">เสียงแจ้งเตือนยังไม่เปิด</div>
      <div style="font-size: 11px; color: #fbbf24; margin-top: 2px;">คลิกเพื่อเปิดเสียง Emergency Call</div>
    </div>
    <button id="vasd-enable-btn" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 13px; white-space: nowrap;">
      🔊 เปิดเสียง
    </button>
    <button id="vasd-dismiss-btn" style="background: transparent; color: #94a3b8; border: none; padding: 4px 8px; cursor: pointer; font-size: 18px; line-height: 1;" title="ปิด">×</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('vasd-enable-btn').onclick = async () => {
    console.log('[VASD Alarm] User clicked "Enable Sound"');
    const ok = await unlockAudio();
    console.log('[VASD Alarm] Audio unlock result:', ok, 'state:', audioContext?.state);

    if (ok) {
      localStorage.setItem(AUDIO_ENABLED_KEY, 'yes');
      // ขอ Notification permission ทันที (อยู่ใน user gesture)
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) {}
      }
      banner.remove();
      // ปี้บคอนเฟิร์มสั้นๆ ให้รู้ว่าเปิดเสียงสำเร็จ
      try {
        const ctx = audioContext;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.25;
        o.connect(g).connect(ctx.destination);
        o.frequency.value = 880;
        o.type = 'sine';
        o.start();
        o.stop(ctx.currentTime + 0.15);
      } catch (e) {}
    } else {
      alert(
        '⚠️ เบราว์เซอร์บล็อกเสียงอยู่\n\n' +
        '【Firefox】\n' +
        '1. คลิกที่ไอคอน 🛡️ หรือ 🔒 ที่ address bar\n' +
        '2. หา "Autoplay" / "เล่นอัตโนมัติ"\n' +
        '3. เปลี่ยนเป็น "Allow Audio and Video"\n\n' +
        '【Chrome】มักไม่มีปัญหานี้ แต่ถ้ามี:\n' +
        '1. คลิก 🔒 → Site settings → Sound → Allow\n\n' +
        'รีโหลดหน้าเว็บแล้วกด "เปิดเสียง" อีกครั้ง'
      );
    }
  };

  document.getElementById('vasd-dismiss-btn').onclick = () => banner.remove();
}

// ═══════════════════════════════════════════
// เสียงไซเรน (สังเคราะห์)
// ═══════════════════════════════════════════
async function playAlarmSound() {
  const ctx = await ensureAudioContext();
  if (!ctx || ctx.state !== 'running') {
    console.warn('[VASD Alarm] Cannot play sound, AudioContext state:', ctx?.state);
    showEnableBanner(); // แสดง banner ให้ผู้ใช้เปิดเสียง
    return null;
  }
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.type = 'sawtooth';
    gain.gain.value = 0.3;
    oscillator.frequency.value = 600;
    oscillator.start();

    let freq = 600, up = true;
    const freqInterval = setInterval(() => {
      if (up) { freq += 80; if (freq >= 1200) up = false; }
      else    { freq -= 80; if (freq <= 600)  up = true;  }
      try { oscillator.frequency.setValueAtTime(freq, ctx.currentTime); } catch (e) {}
    }, 60);

    console.log('[VASD Alarm] 🔊 Alarm sound STARTED');
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
// TTS / Vibration / Notification / Title
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

function startVibration() {
  if (!navigator.vibrate) return null;
  const tick = () => { try { navigator.vibrate(VIBRATION_PATTERN); } catch (e) {} };
  tick();
  return setInterval(tick, 3000);
}
function stopVibration(h) {
  if (h) clearInterval(h);
  if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
}

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

function startTitleFlash() {
  const original = document.title;
  let flip = false;
  const interval = setInterval(() => {
    document.title = (flip = !flip) ? '🚨 EMERGENCY 🚨' : '⚠️ ตอบรับด่วน!';
  }, 600);
  return { interval, original };
}
function stopTitleFlash(h) {
  if (!h) return;
  clearInterval(h.interval);
  document.title = h.original;
}

// ═══════════════════════════════════════════
// Overlay
// ═══════════════════════════════════════════
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
      <button class="vasd-emerg-ack-btn" id="vasd-ack-btn">✅ รับทราบ กำลังไป</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('vasd-ack-btn').onclick = () => acknowledgeAlarm(call.id);
}

function removeOverlay() {
  const o = document.getElementById('vasd-emergency-overlay');
  if (o) o.remove();
}

// ═══════════════════════════════════════════
// Trigger / Stop
// ═══════════════════════════════════════════
async function triggerAlarm(call) {
  if (activeAlarm && activeAlarm.id === call.id) return;
  stopActiveAlarm();
  console.log('[VASD Alarm] 🚨 TRIGGER for', call.sender, call.role);

  showOverlay(call);
  const audio = await playAlarmSound();
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
  console.log('[VASD Alarm] ACK by', ackName);
  try {
    await supabase
      .from('vasd_emergency_call')
      .update({ acknowledged_by: ackName, acknowledged_at: new Date().toISOString() })
      .eq('id', callId)
      .is('acknowledged_at', null);
  } catch (e) {
    console.warn('[VASD Alarm] ACK failed', e);
  }
  stopActiveAlarm();
}

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════
function injectStyles() {
  if (document.getElementById('vasd-alarm-styles')) return;
  const style = document.createElement('style');
  style.id = 'vasd-alarm-styles';
  style.textContent = `
    #vasd-enable-banner {
      position: fixed; top: 10px; left: 50%;
      transform: translateX(-50%);
      max-width: 92%; min-width: 280px;
      background: linear-gradient(135deg, #1e293b, #334155);
      border: 2px solid #f59e0b;
      border-radius: 12px;
      padding: 12px 14px;
      z-index: 99998;
      display: flex; align-items: center; gap: 10px;
      font-family: "Sarabun", -apple-system, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(245,158,11,0.3);
      animation: vasdEbSlide 0.4s ease;
    }
    @keyframes vasdEbSlide {
      from { transform: translate(-50%, -100px); opacity: 0; }
      to   { transform: translate(-50%, 0); opacity: 1; }
    }

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
    .vasd-emerg-subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; margin-bottom: 24px; }
    .vasd-emerg-sender {
      background: #fef2f2; border: 2px solid #fecaca;
      border-radius: 16px; padding: 16px; margin-bottom: 16px;
    }
    .vasd-emerg-label { font-size: 11px; color: #991b1b; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
    .vasd-emerg-name { font-size: 26px; font-weight: 800; color: #111827; margin-top: 4px; word-break: break-word; }
    .vasd-emerg-role { font-size: 14px; color: #4b5563; margin-top: 2px; }
    .vasd-emerg-time { font-size: 12px; color: #9ca3af; margin-bottom: 20px; font-family: "Outfit", sans-serif; }
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

  // Auto-unlock บน user interaction แรก
  const tryUnlock = async () => {
    await ensureAudioContext();
  };
  document.addEventListener('click', tryUnlock, { once: true });
  document.addEventListener('touchstart', tryUnlock, { once: true });
  document.addEventListener('keydown', tryUnlock, { once: true });

  // แสดง banner ถ้ายังไม่เคย enable เสียง
  if (localStorage.getItem(AUDIO_ENABLED_KEY) !== 'yes') {
    setTimeout(showEnableBanner, 800);
  }

  // Subscribe realtime
  try {
    supabase.channel('vasd-emergency-' + Math.random().toString(36).slice(2, 8))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vasd_emergency_call' },
        (payload) => {
          const call = payload.new;
          console.log('[VASD Alarm] 📥 INSERT received', call);
          if (!call || !call.created_at) return;
          const ageSec = (Date.now() - new Date(call.created_at).getTime()) / 1000;
          if (ageSec > STALE_SECONDS) { console.log('[VASD Alarm] Stale, skip'); return; }
          if (call.acknowledged_at) { console.log('[VASD Alarm] Already acked, skip'); return; }
          triggerAlarm(call);
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vasd_emergency_call' },
        (payload) => {
          if (payload.new && payload.new.acknowledged_at &&
              activeAlarm && activeAlarm.id === payload.new.id) {
            console.log('[VASD Alarm] Remote ACK, stopping');
            stopActiveAlarm();
          }
        })
      .subscribe((status) => {
        console.log('[VASD Alarm] Realtime status:', status);
      });
  } catch (e) {
    console.warn('[VASD Alarm] subscribe failed', e);
  }

  // เช็คเคสค้างตอนเปิดหน้า
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
      console.log('[VASD Alarm] Pending emergency on load:', data[0]);
      triggerAlarm(data[0]);
    }
  } catch (e) {
    console.warn('[VASD Alarm] Initial check failed', e);
  }
}

init();
