// ==========================================
// SUPABASE CONNECTION FILE
// এখানে আপনার নিজের URL আর KEY বসাতে হবে
// ==========================================

// ⚠️ নিচের দুইটা লাইনে YOUR_... এর জায়গায় আপনার নিজের তথ্য বসান
export const SUPABASE_URL = 'https://xppsabrnnlwnubzthlxn.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_-Xr8fSuQZL3z9doU9laRmg_oRdHR_RR';

// Supabase library লোড করা
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase client তৈরি
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);