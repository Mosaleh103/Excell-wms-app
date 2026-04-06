// ── SUPABASE CONNECTION ── (Load First)
const { createClient } = supabase;

// ضع روابط ومفاتيح المشروع الجديد (WMS) هنا بدلاً من القديمة
const SUPABASE_URL = 'https://ihubaduxdqonvcfhamny.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlodWJhZHV4ZHFvbnZjZmhhbW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NjI2MDUsImV4cCI6MjA5MTAzODYwNX0.ZzIjxZ-4X2k_fi0_x1fF5qibGS40GAbpxBKbDBjlZSw';

window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = window.supabase; // للربط مع ملفات CRM القديمة

