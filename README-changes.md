# VASD – เพิ่มฟีเจอร์ "ตารางผ่าตัด รพส."

สรุปการเปลี่ยนแปลง / ไฟล์ที่ต้องอัปเดตเข้าโปรเจกต์

---

## 📂 ไฟล์ที่ส่งมอบ (4 ไฟล์)

| ไฟล์ | สถานะ | บทบาท |
|------|-------|-------|
| `index.html` | **แก้ไข** (แทนที่ของเดิม) | เพิ่มการ์ด **"ตารางผ่าตัด รพส."** สีแดงโดดเด่น ที่แถวบนสุดของ menu-grid และเพิ่ม badge แสดงจำนวนเคสที่นัดไว้แบบ real-time |
| `settings.html` | **แก้ไข** (แทนที่ของเดิม) | เพิ่มเมนู **"จัดการตารางผ่าตัด รพส."** เป็นเมนูแรกในหน้าตั้งค่า (ไฮไลต์สีแดง) |
| `surgery-schedule.html` | **ใหม่** | หน้าแสดงตารางผ่าตัด (read-only) ที่ผู้ใช้ทุกคนดูได้เมื่อกดการ์ดสีแดงจาก dashboard |
| `Setting-SurgerySchedule.html` | **ใหม่** | หน้าจัดการ (เพิ่ม / แก้ไข / ลบ / เปลี่ยนสถานะ) เปิดผ่านเมนู **ตั้งค่า** |

> ⚠️ ไฟล์เก่า `surgery.html`, `Setting-Sticker.html`, `Setting-Database.html`, ฯลฯ **ไม่ถูกแก้ไข** ไม่กระทบของเดิม

---

## 🗄️ ต้องสร้างตารางบน Supabase ก่อนเริ่มใช้

ตาราง `vasd_vh_surgery_schedule` (ขึ้นต้นด้วย `vasd_` ตามแพตเทิร์นเดิมของระบบ + `vh_` = veterinary hospital)

รันคำสั่งนี้ใน **Supabase SQL Editor**:

```sql
create table public.vasd_vh_surgery_schedule (
  id              bigserial primary key,
  schedule_date   date not null,
  schedule_time   time,
  animal_name     text,
  animal_species  text,
  owner_name      text,
  procedure       text,
  surgeon         text,
  notes           text,
  status          text default 'scheduled',  -- scheduled | completed | cancelled
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- เปิด RLS แต่อนุญาตเข้าถึงได้ทุกคน (สอดคล้องกับ pattern เดิมของระบบ)
alter table public.vasd_vh_surgery_schedule enable row level security;
create policy "vh_sched_all" on public.vasd_vh_surgery_schedule
  for all using (true) with check (true);

-- เปิด realtime เพื่อให้ badge บน dashboard และหน้าตารางอัปเดตทันที
alter publication supabase_realtime add table public.vasd_vh_surgery_schedule;
```

หากยังไม่ได้รัน SQL — หน้า `Setting-SurgerySchedule.html` จะแสดงคำเตือนพร้อมคำสั่ง SQL ให้ก็อปไปรันได้เลย

---

## ✨ ฟีเจอร์โดยย่อ

### บน Dashboard (`index.html`)
- การ์ด **"ตารางผ่าตัด รพส."** สีแดง gradient (ef4444 → b91c1c) วางเป็นการ์ดเต็มแถวที่ด้านบนสุด
- Badge สีขาวมุมขวาบน แสดงจำนวน "เคสที่นัดไว้ตั้งแต่วันนี้เป็นต้นไป" — อัปเดต real-time เมื่อมีการเพิ่ม/แก้ไข/ลบ
- ถ้ายังไม่ได้สร้างตาราง — badge จะถูกซ่อนเงียบ ๆ ไม่รบกวนการ์ดอื่น

### หน้าดู (`surgery-schedule.html`) — เปิดเมื่อกดการ์ดสีแดง
- จัดกลุ่มตามวัน + แสดงเป็นรายการพร้อมสีฉลาก (นัดไว้/เสร็จสิ้น/ยกเลิก)
- ฟิลเตอร์: **วันนี้และวันถัดไป** (ค่าเริ่มต้น) / เฉพาะวันนี้ / 7 วันข้างหน้า / ทั้งหมด
- ค้นหาตามชื่อสัตว์ / เจ้าของ / ศัลยแพทย์ / รายการผ่าตัด
- Realtime sync — มีการเปลี่ยนแปลงในหน้าตั้งค่า แสดงผลทันทีโดยไม่ต้อง refresh

### หน้าจัดการ (`Setting-SurgerySchedule.html`) — เปิดผ่านเมนู ตั้งค่า
- ฟอร์มเพิ่มรายการ (วันที่/เวลา/ชื่อสัตว์/ชนิด/เจ้าของ/ศัลยแพทย์/รายการผ่าตัด/สถานะ/หมายเหตุ)
- รายการทั้งหมดพร้อมปุ่ม ✏️ แก้ไข และ 🗑️ ลบ
- ฟิลเตอร์ตามสถานะ + ค้นหา
- Toast notification + แจ้งเตือนเมื่อยังไม่ได้สร้างตาราง พร้อมคำสั่ง SQL ที่ก็อปได้

---

## 🚀 วิธีติดตั้ง

1. รัน SQL ด้านบนใน Supabase
2. แทนที่ไฟล์ `index.html` และ `settings.html` ของเดิม ด้วยไฟล์ใหม่
3. วางไฟล์ใหม่ `surgery-schedule.html` และ `Setting-SurgerySchedule.html` ไว้ที่ root ของโปรเจกต์ (ระดับเดียวกับ `index.html`)
4. Push ขึ้น GitHub — เสร็จ
