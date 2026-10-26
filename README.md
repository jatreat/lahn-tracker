# Lahn Election Day Tracker

Field tracker for Nov 3, 2026. Six tabs: Overview, Crossover Watch, County Results, Turnout Checks, Chase, Incidents.

This GitHub Pages copy is for volunteers without a Claude account. Entries go to a Google Sheet through a small Apps Script, gated by a team passcode. Staff with Claude accounts can use the Claude-hosted copy, which has its own live shared database. The two copies do not share data, so pick one per role (for example, Claude copy for the returns desk, this site for poll checkers and chase teams). Every tab has a Copy CSV button for moving data between them.

## Setup

1. **Backend.** Follow the steps at the top of `apps-script/Code.gs`. You end up with a web app URL ending in `/exec` and a passcode stored in Script Properties.
2. **Connect the site.** Edit `config.js` and paste the URL into `sheetUrl`. Commit.
3. **Publish.** Repo Settings → Pages → Deploy from branch → `main` / root. The site is at `https://jatreat.github.io/lahn-tracker/`.
4. **Test.** Open the site, sign in with any name and the passcode, add a test incident, and confirm it shows up on the `incidents` sheet. Delete the test row.

Without `sheetUrl`, the site runs in preview mode and saves only to the browser it is opened in.

## Data

Absentee ballots by party and Republican ballots outstanding come from the Iowa SOS county report embedded in `index.html` (Oct 23, 2026). 2022 baselines are Reynolds and DeJear county totals and Sand's 2022 auditor edge.

## Notes

- The site refreshes from the Sheet every 20 seconds.
- The passcode keeps casual visitors out. It is not strong security, so do not put voter-file data or anything private in free-text fields.
- Reporter phone numbers in the Incident log are stored in the Sheet. Limit Sheet sharing to staff.
