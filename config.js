// Public connection settings for the ASC Research door. These are SAFE to publish: the publishable key only
// works under the database's row-level security. The tower's secret key never goes in this file.
window.ASC_RESEARCH = {
  supabaseUrl: "",   // e.g. https://<project-ref>.supabase.co  — filled in when the project exists
  supabaseKey: "",   // publishable (anon) key
};
