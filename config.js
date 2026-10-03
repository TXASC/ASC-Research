// Public connection settings for the ASC Research door. These are SAFE to publish: the publishable key only
// works under the database's row-level security. The tower's secret key never goes in this file.
window.ASC_RESEARCH = {
  supabaseUrl: "https://wkknekzzvzbtvrqdxpzw.supabase.co",
  checklistWrites: true,   // Documents Needed controls ON: Supabase door v3.1 applied and verified 2026-10-03
  supabaseKey: "sb_publishable_JHKCGo3vuzZTNT5NBTWkSA_o7g1mrzK",
};
