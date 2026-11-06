# Vernon Men's Indoor Hub

Fixtures, live table, stats, squads and a captain result form for the Vernon Men's Indoor league. Built and run by KB Media. **Concept** until the league signs off.

- **Live site:** `index.html` + `app.js`, data from Supabase (`config.js`).
- **Demo with sample data:** `demo.html` (for the promo video and survey).
- **Database:** `supabase/schema.sql` (tables, security rules, captain and admin functions) and `supabase/seed.sql` (2026-27 schedule, teams, Alba squad).

## How results work
1. Each team's captain gets a private link (`?c=TOKEN#captain`) from the Admin page.
2. Captain reports score and scorers. It lands as *pending*.
3. Admin signs in at `#admin` and approves. The table and stats update.

## Adding another league
Insert a new row in `leagues`, a `season`, its `teams` and `fixtures`, then deploy a copy of the site with a different `league` slug in `config.js`.
