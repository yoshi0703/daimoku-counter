import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://yydkvjaytggaqbhcookk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZGt2amF5dGdnYXFiaGNvb2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTQ5NzEsImV4cCI6MjA4MjQ5MDk3MX0.a4U_5CpDag6nGQIaFTj5qwq3ajR6t9WhSjQpBPNnB2k";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
