// ไฟล์: js/global-alarm.js
import { supabase } from "./supabase.js";

// ฟังก์ชันสร้างเสียงแจ้งเตือน
function playAlarmSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    
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
    console.log("Audio not supported", err); 
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
      // หน่วงเวลาเล็กน้อยให้เสียงดังก่อนเด้ง Alert (เพราะ Alert มักจะบล็อกการทำงานอื่น)
      setTimeout(() => {
        alert(`🚨 สัญญาณเรียกฉุกเฉิน!\nจาก: ${payload.payload.sender} (${payload.payload.role})\nเวลา: ${payload.payload.time}`);
      }, 100);
    }
  })
  .subscribe();
