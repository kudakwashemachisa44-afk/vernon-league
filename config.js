// Public settings. The key here is Supabase's public anon key: it is meant to be public,
// and the database's row-level security decides what it can read or change.
window.LEAGUE_CONFIG = {
  url: 'https://rzqggwnfpjregluznhfj.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6cWdnd25mcGpyZWdsdXpuaGZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODQyNDMsImV4cCI6MjEwOTU2MDI0M30.rgI_6iGGl8Jg4Yz-mCwJVo7ywDlHRV7mhwQ5J5OcXI4',
  league: 'vernon-mens-indoor',
  email: 'kbmedia.ca@gmail.com',     // bookings email shown on the gallery
  booking: 'https://kbmediaca.com/bookings',  // KB Media booking page (Book a shoot button)
  // Card bans: red = games out; every Nth yellow = games out. Confirm with the league and change here.
  discipline: { redGames: 1, yellowLimit: 3, yellowGames: 1 }
};
