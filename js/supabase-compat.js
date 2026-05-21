/* ============================================================
 *  supabase-compat.js
 *  -----------------------------------------------------------
 *  ไฟล์นี้เป็นเวอร์ชัน "ไม่ใช้ ES Module" สำหรับ Smart TV เก่า
 *  ที่ไม่รองรับ <script type="module">  / import / export
 *
 *  วิธีใช้:
 *    1) ใน q.html ให้โหลด supabase UMD จาก CDN ก่อน
 *    2) แล้วจึงโหลดไฟล์นี้ (เป็น <script> ปกติ ไม่มี type=module)
 *    3) ใส่ URL + ANON KEY ของคุณด้านล่าง
 *  ============================================================ */

(function (global) {
  'use strict';

  // ─── ★ ใส่ค่าจากไฟล์ ./js/supabase.js เดิมของคุณตรงนี้ ───
  var SUPABASE_URL      = 'https://cagjnlxmbeuyenawowmm.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZ2pubHhtYmV1eWVuYXdvd21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNDY4MjksImV4cCI6MjA4NjgyMjgyOX0.Lwy2vZd8ifZ7tSohmKivAJJqYd3wcBO7hHQtFZ6efYc';
  // ────────────────────────────────────────────────────────────

  if (!global.supabase || typeof global.supabase.createClient !== 'function') {
    console.error('[supabase-compat] ไม่พบ supabase UMD — กรุณาโหลด <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> ก่อนไฟล์นี้');
    return;
  }

  try {
    // สร้าง client แล้วเก็บใน global ให้ q.html เรียกใช้
    var client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    });
    global.supabaseClient = client;
    console.log('[supabase-compat] พร้อมใช้งาน');
  } catch (e) {
    console.error('[supabase-compat] init ล้มเหลว:', e);
  }
})(window);
