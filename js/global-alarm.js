import { supabase } from "./supabase.js";

// 1. ประกาศตัวแปร AudioContext ไว้ภายนอก
let audioCtx = null;
let isAudioUnlocked = false;

// ฟังก์ชันสร้างหรือเรียกใช้ AudioContext
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// 2. ฟังก์ชันปลดล็อกระบบเสียง (ต้องถูกเรียกผ่านการโต้ตอบของผู้ใช้)
function unlockAudio() {
  if (isAudioUnlocked) return;
  
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {
      isAudioUnlocked = true;
    }).catch(err => console.error("Cannot resume AudioContext:", err));
  } else {
    isAudioUnlocked = true;
  }

  // สร้างคลื่นเสียงเงียบๆ (Silent Oscillator) เพื่อบังคับให้ระบบเสียงเปิดทำงานเต็มตัว
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0; // ปิดระดับเสียงให้เงียบสนิท
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.001);

  // เมื่อปลดล็อกสำเร็จ ให้ลบ Event ออกเพื่อลดภาระการทำงาน
  document.removeEventListener('click', unlockAudio);
  document.removeEventListener('touchstart', unlockAudio);
}

// ผูก Event เพื่อปลดล็อกเสียงเมื่อคลิกหรือแตะหน้าจอครั้งแรกหลัง Refresh
document.addEventListener('click', unlockAudio);
document.addEventListener('touchstart', unlockAudio);

// ฟังก์ชันเล่นเสียงแจ้งเตือน
function playAlarmSound() {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume(); // พยายามปลุกอีกรอบถ้ายังหลับอยู่
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sawtooth';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.5);
    osc.frequency.linearRampToValueAtTime(400, now + 1.0);
    osc.frequency.linearRampToValueAtTime(800, now + 1.5);
    osc.frequency.linearRampToValueAtTime(400, now + 2.0);
    
    gain.gain.setValueAtTime(0.5, now);
    osc.start(now);
    osc.stop(now + 2.0);
  } catch (err) { 
    console.error("Audio playback error:", err); 
  }
}

// สร้าง Channel สำหรับฟังเสียงแจ้งเตือน
const alarmChannel = supabase.channel('emergency-live', { config: { broadcast: { self: true } } });

alarmChannel
  .on('broadcast', { event: 'emergency_call' }, (payload) => {
    // เช็คสิทธิ์ก่อนว่าคนเปิดหน้านี้อยู่คือใคร
    const myRole = (localStorage.getItem("vasd_role") || "").trim();
    if (["ผู้ดูแลระบบ", "อาจารย์", "สัตวแพทย์"].includes(myRole)) {
      playAlarmSound();
      
      // หน่วงเวลาเพิ่มขึ้นเป็น 300ms ให้ระบบมีเวลาผลักเสียงออกลำโพงก่อนที่ alert() จะฟรีซเบราว์เซอร์
      setTimeout(() => {
        alert(`🚨 สัญญาณเรียกฉุกเฉิน!\nจาก: ${payload.payload.sender} (${payload.payload.role})\nเวลา: ${payload.payload.time}`);
      }, 300);
    }
  })
  .subscribe();
