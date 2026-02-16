// js/supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Supabase VASD
const SUPABASE_URL = "https://cagjnlxmbeuyenawowmm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KYPZNIG4qJJ03w2744M4iw_YVzLhCMU";

// Create client
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("✅ Supabase connected (VASD)");
