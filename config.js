// Public connection settings for the ASC Research door. These are SAFE to publish: the publishable key only
// works under the database's row-level security. The tower's secret key never goes in this file.
// Consolidated ASC project (2026-10-08): research tables live in the "research" schema, files in renamed buckets.
window.ASC_RESEARCH = {
  supabaseUrl: "https://cjwiaxadnoboqvjvycwt.supabase.co",
  supabaseKey: "sb_publishable_xnqCxqng84CLXXLrC_HYKQ_xeWvF-rr",
  schema: "research",
  packagesBucket: "research-packages",
  uploadsBucket: "research-uploads",
  checklistWrites: true,   // Documents Needed controls ON: Supabase door v3.1 applied and verified 2026-10-03
  pageDecisions: false,     // SWP-7 question buttons + whole-block switch: ON after the staged door SQL (asc-supabase 102935a) is applied
};
