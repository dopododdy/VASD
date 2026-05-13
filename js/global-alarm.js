// js/global-alarm.js — v3.1
// VASD Emergency Call Alert System
// แก้: เตือนเฉพาะบทบาท "ผู้ดูแลระบบ" "อาจารย์" "สัตวแพทย์" เท่านั้น

import { supabase } from './supabase.js';

const STALE_SECONDS = 60;
const TTS_REPEAT_MS = 5000;
const VIBRATION_PATTERN = [400, 200, 400, 200, 400, 200, 1000];
const SESSION_DISMISS_KEY = 'vasd_banner_dismissed';

// ★ บทบาทที่จะได้รับเสียงเตือน (อื่นๆ จะไม่ดัง)
const ALERT_RECEIVER_ROLES = ['ผู้ดูแลระบบ', 'อาจารย์', 'สัตวแพทย์'];

let audioContext = null;
let activeAlarm = null;

console.log(
  '[VASD Alarm v3.1] loaded on',
  location.pathname,
  '| role:',
  localStorage.getItem('vasd_role') || '(not logged in)'
);

// ═══════════════════════════════════════════
// Role check — เรียกใหม่ทุกครั้ง (อ่านจาก localStorage สดๆ)
// ═══════════════════════════════════════════
function isAlertReceiver() {
  const role = (localStorage.getItem('vasd_role') || '').trim();
  return ALERT_RECEIVER_ROLES.includes(role);
}

// ═══════════════════════════════════════════
// AudioContext
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
      console.log('[VASD Alarm] After resume(), state =', audioContext.state);
    } catch (e) {
      console.warn('[VASD Alarm] resume() failed', e);
    }
  }
  return audioContext;
}

function isAudioReady() {
  return audioContext && audioContext.state === 'running';
}

async function unlockAudio() {
  const ctx = await ensureAudioContext();
  if (!ctx || ctx.state !== 'running') return false;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
    return true;
  } catch (e) { return false; }
}

window.unlockAudioForAlarm = unlockAudio;

// ═══════════════════════════════════════════
// Enable Sound Banner
// ═══════════════════════════════════════════
function showEnableBanner(urgent = false) {
  let banner = document.getElementById('vasd-enable-banner');
  if (banner) {
    if (urgent) banner.classList.add('vasd-eb-urgent');
    return;
  }

  banner = document.createElement('div');
  banner.id = 'vasd-enable-banner';
  if (urgent) banner.classList.add('vasd-eb-urgent');
  banner.innerHTML = `
    <span class="vasd-eb-icon">🔇</span>
    <div class="vasd-eb-text">
      <div class="vasd-eb-title">เสียงเตือนยังไม่เปิดในหน้านี้</div>
      <div class="vasd-eb-sub">กดปุ่มขวาเพื่อเปิดเสียง Emergency</div>
    </div>
    <button id="vasd-enable-btn" class="vasd-eb-go-btn">🔊 เปิดเสียง</button>
    <button id="vasd-dismiss-btn" class="vasd-eb-x-btn" title="ปิดสำหรับหน้านี้">×</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('vasd-enable-btn').onclick = async () => {
    console.log('[VASD Alarm] User clicked Enable Sound');
    const ok = await unlockAudio();
    console.log('[VASD Alarm] Unlock result:', ok, '- state:', audioContext?.state);
    if (ok) {
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) {}
      }
      banner.remove();
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
        '【Firefox】คลิก 🛡️/🔒 ที่ address bar → Autoplay → "Allow Audio and Video"\n\n' +
        '【iOS Safari】Settings → Safari → ปิด Block Pop-ups + เปิดเสียงเครื่อง\n\n' +
        '【Android Chrome】มักไม่มีปัญหา ถ้ามีให้เปิดเสียงเครื่อง + กดปุ่มอีกครั้ง\n\n' +
        'รีโหลดหน้าแล้วลองอีกครั้ง'
      );
    }
  };

  document.getElementById('vasd-dismiss-btn').onclick = () => {
    banner.remove();
    sessionStorage.setItem(SESSION_DISMISS_KEY, 'yes');
  };
}

// ═══════════════════════════════════════════
// เสียงไซเรน
// ═══════════════════════════════════════════
async function playAlarmSound() {
  const ctx = await ensureAudioContext();
  if (!ctx || ctx.state !== 'running') {
    console.warn('[VASD Alarm] ⚠️ Cannot play sound — state:', ctx?.state);
    sessionStorage.removeItem(SESSION_DISMISS_KEY);
    showEnableBanner(true);
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

    console.log('[VASD Alarm] 🔊 Sound started');
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
  // ★ เช็คบทบาทก่อนเตือน — เฉพาะผู้ดูแลระบบ/อาจารย์/สัตวแพทย์
  if (!isAlertReceiver()) {
    const role = localStorage.getItem('vasd_role') || '(ไม่ได้ login)';
    console.log('[VASD Alarm] 🔕 ข้ามการเตือน — role "' + role + '" ไม่อยู่ในรายชื่อผู้รับ');
    return;
  }

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
      max-width: 94%; width: max-content;
      background: linear-gradient(135deg, #1e293b, #334155);
      border: 2px solid #f59e0b;
      border-radius: 12px;
      padding: 10px 12px;
      z-index: 99998;
      display: flex; align-items: center; gap: 10px;
      font-family: "Sarabun", -apple-system, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(245,158,11,0.3);
      animation: vasdEbSlide 0.4s ease;
    }
    #vasd-enable-banner.vasd-eb-urgent {
      border-color: #ef4444;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 30px rgba(239,68,68,0.6);
      animation: vasdEbSlide 0.4s ease, vasdEbUrgent 0.8s ease-in-out infinite;
    }
    @keyframes vasdEbSlide {
      from { transform: translate(-50%, -100px); opacity: 0; }
      to   { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes vasdEbUrgent {
      0%, 100% { background: linear-gradient(135deg, #1e293b, #334155); }
      50%      { background: linear-gradient(135deg, #7f1d1d, #991b1b); }
    }
    .vasd-eb-icon { font-size: 22px; flex-shrink: 0; }
    .vasd-eb-text { flex: 1; min-width: 0; }
    .vasd-eb-title { font-weight: 700; color: #fff; font-size: 13px; }
    .vasd-eb-sub { font-size: 11px; color: #fbbf24; margin-top: 2px; }
    .vasd-eb-go-btn {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff; border: none;
      padding: 10px 16px; border-radius: 8px;
      font-weight: 700; cursor: pointer;
      font-family: inherit; font-size: 13px;
      white-space: nowrap;
    }
    .vasd-eb-x-btn {
      background: transparent; color: #94a3b8;
      border: none; padding: 4px 8px;
      cursor: pointer; font-size: 18px; line-height: 1;
    }
    @media (max-width: 480px) {
      #vasd-enable-banner {
        max-width: 96%;
        padding: 8px 10px;
        gap: 8px;
      }
      .vasd-eb-icon { font-size: 18px; }
      .vasd-eb-title { font-size: 12px; }
      .vasd-eb-sub { font-size: 10px; }
      .vasd-eb-go-btn { padding: 8px 12px; font-size: 12px; }
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

  // Auto-unlock บน user interaction ใดๆ
  const tryUnlock = async () => {
    const wasReady = isAudioReady();
    await ensureAudioContext();
    if (!wasReady && isAudioReady()) {
      console.log('[VASD Alarm] ✅ Auto-unlocked via user interaction');
      const banner = document.getElementById('vasd-enable-banner');
      if (banner) banner.remove();
    }
  };
  document.addEventListener('click', tryUnlock);
  document.addEventListener('touchstart', tryUnlock, { passive: true });
  document.addEventListener('keydown', tryUnlock);

  // ★ Banner: เด้งเฉพาะถ้าเป็นบทบาทที่จะรับสัญญาณ
  setTimeout(async () => {
    if (!isAlertReceiver()) {
      console.log('[VASD Alarm] User ไม่ใช่ผู้รับสัญญาณ — ข้าม banner');
      return;
    }
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === 'yes') return;
    await ensureAudioContext();
    if (!isAudioReady()) {
      console.log('[VASD Alarm] Audio not ready, showing banner. State:', audioContext?.state);
      showEnableBanner();
    } else {
      console.log('[VASD Alarm] Audio ready on load');
    }
  }, 800);

  // Realtime subscribe (always — เผื่อ user login ภายหลัง)
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
          triggerAlarm(call); // role check อยู่ใน triggerAlarm
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vasd_emergency_call' },
        (payload) => {
          if (payload.new && payload.new.acknowledged_at &&
              activeAlarm && activeAlarm.id === payload.new.id) {
            console.log('[VASD Alarm] Remote ACK, stop');
            stopActiveAlarm();
          }
        })
      .subscribe((status) => {
        console.log('[VASD Alarm] Realtime status:', status);
      });
  } catch (e) {
    console.warn('[VASD Alarm] subscribe failed', e);
  }

  // เช็คเคสค้าง
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
      triggerAlarm(data[0]); // role check อยู่ใน triggerAlarm
    }
  } catch (e) {
    console.warn('[VASD Alarm] Initial check failed', e);
  }
}

init();
