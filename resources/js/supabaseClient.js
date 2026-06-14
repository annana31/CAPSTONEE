import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fwekghbjaejubswwcpnu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3ZWtnaGJqYWVqdWJzd3djcG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzQ3MDAsImV4cCI6MjA5NjY1MDcwMH0.u7Xzhm-Wo6_Bk_xnIqCwrkT1h2BkIQhamXGi5LWzHJ8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);