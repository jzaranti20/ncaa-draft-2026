// ESPN NCAA Tournament Score Fetcher v5
// ESPN IS THE SOURCE OF TRUTH
// - Fills in blanks for new games
// - CORRECTS mistakes (if DB says W but ESPN says L, fixes it)
// - Only skips First Four games
// - Logs everything clearly

let FIREBASE_DB_URL = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");

const NAME_MAP = {
  "Duke Blue Devils":"Duke","Siena Saints":"Siena","Ohio State Buckeyes":"Ohio State",
  "TCU Horned Frogs":"TCU","St. John's Red Storm":"St. John's",
  "Northern Iowa Panthers":"Northern Iowa","Kansas Jayhawks":"Kansas",
  "Cal Baptist Lancers":"Cal Baptist","Louisville Cardinals":"Louisville",
  "South Florida Bulls":"South Florida","Michigan State Spartans":"Michigan State",
  "North Dakota State Bison":"North Dakota St","UCLA Bruins":"UCLA",
  "UCF Knights":"UCF","UConn Huskies":"UConn","Furman Paladins":"Furman",
  "Arizona Wildcats":"Arizona","LIU Sharks":"LIU",
  "Long Island University Sharks":"LIU","Villanova Wildcats":"Villanova",
  "Utah State Aggies":"Utah State","Wisconsin Badgers":"Wisconsin",
  "High Point Panthers":"High Point","Arkansas Razorbacks":"Arkansas",
  "Hawaii Rainbow Warriors":"Hawai'i","Hawai'i Rainbow Warriors":"Hawai'i",
  "BYU Cougars":"BYU",
  "SMU Mustangs":"Miami (OH) / SMU","Miami (OH) RedHawks":"Miami (OH) / SMU",
  "Miami Ohio RedHawks":"Miami (OH) / SMU",
  "Gonzaga Bulldogs":"Gonzaga","Kennesaw State Owls":"Kennesaw State",
  "Miami Hurricanes":"Miami (FL)","Missouri Tigers":"Missouri",
  "Purdue Boilermakers":"Purdue","Queens Royals":"Queens",
  "Michigan Wolverines":"Michigan",
  "Howard Bison":"Howard / UMBC","UMBC Retrievers":"Howard / UMBC",
  "Georgia Bulldogs":"Georgia","Saint Louis Billikens":"Saint Louis",
  "Vanderbilt Commodores":"Vanderbilt","McNeese Cowboys":"McNeese",
  "Alabama Crimson Tide":"Alabama","Hofstra Pride":"Hofstra",
  "Tennessee Volunteers":"Tennessee",
  "Texas Longhorns":"Texas / NC State","NC State Wolfpack":"Texas / NC State",
  "Virginia Cavaliers":"Virginia","Wright State Raiders":"Wright State",
  "Kentucky Wildcats":"Kentucky","Santa Clara Broncos":"Santa Clara",
  "Iowa State Cyclones":"Iowa State","Tennessee State Tigers":"Tennessee State",
  "Florida Gators":"Florida",
  "Prairie View A&M Panthers":"PV A&M / Lehigh","Lehigh Mountain Hawks":"PV A&M / Lehigh",
  "Clemson Tigers":"Clemson","Iowa Hawkeyes":"Iowa",
  "Texas Tech Red Raiders":"Texas Tech","Akron Zips":"Akron",
  "Nebraska Cornhuskers":"Nebraska","Troy Trojans":"Troy",
  "North Carolina Tar Heels":"North Carolina","VCU Rams":"VCU",
  "Illinois Fighting Illini":"Illinois","Penn Quakers":"Penn",
  "Saint Mary's Gaels":"Saint Mary's","Texas A&M Aggies":"Texas A&M",
  "Houston Cougars":"Houston","Idaho Vandals":"Idaho"
};

function mapName(espnName) {
  if (!espnName) return null;
  if (NAME_MAP[espnName]) return NAME_MAP[espnName];
  for (const [key, val] of Object.entries(NAME_MAP)) {
    if (espnName.includes(key.split(" ")[0]) && espnName.includes(key.split(" ").pop())) return val;
  }
  return null;
}

function getRoundFromDate(dateStr) {
  const d = parseInt(dateStr);
  if (d <= 20260318) return -1;  // First Four
  if (d <= 20260320) return 0;   // R64
  if (d <= 20260322) return 1;   // R32
  if (d <= 20260327) return 2;   // Sweet 16
  if (d <= 20260329) return 3;   // Elite 8
  if (d <= 20260404) return 4;   // Final Four
  if (d <= 20260406) return 5;   // Championship
  return -1;
}

async function fetchScores() {
  const today = new Date();
  const dates = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  const games = [];
  for (const date of dates) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=100&limit=400`;
      console.log(`📅 Checking ${date}...`);
      const res = await fetch(url);
      const data = await res.json();
      if (!data.events) { console.log("   No events"); continue; }
      let found = 0;
      for (const event of data.events) {
        if (!event.status?.type?.completed) continue;
        const competitors = event.competitions?.[0]?.competitors || [];
        if (competitors.length !== 2) continue;
        const mapped1 = mapName(competitors[0]?.team?.displayName);
        const mapped2 = mapName(competitors[1]?.team?.displayName);
        if (!mapped1 && !mapped2) continue;
        const winner = competitors.find(c => c.winner);
        const loser = competitors.find(c => !c.winner);
        if (!winner || !loser) continue;
        const roundIdx = getRoundFromDate(date);
        found++;
        games.push({ winner: winner.team?.displayName, loser: loser.team?.displayName, winScore: winner.score, loseScore: loser.score, round: roundIdx, date });
      }
      if (found > 0) console.log(`   🏀 ${found} tournament games`);
    } catch (err) { console.error(`   Error: ${err.message}`); }
  }
  return games;
}

async function writeOneResult(teamName, roundIdx, value) {
  const safeKey = encodeURIComponent(teamName).replace(/\./g, '%2E');
  const url = `${FIREBASE_DB_URL}/results/${safeKey}/${roundIdx}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`      ❌ Write failed for ${teamName} round ${roundIdx}: ${res.status} - ${body}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("🏀 NCAA Tournament Score Updater v5");
  console.log("====================================");
  console.log("ESPN = SOURCE OF TRUTH");
  console.log("Fills blanks + corrects mistakes\n");

  if (!FIREBASE_DB_URL) { console.error("❌ FIREBASE_DATABASE_URL not set!"); process.exit(1); }

  // Read current database
  console.log("📥 Reading current results from Firebase...");
  const resResp = await fetch(`${FIREBASE_DB_URL}/results.json`);
  if (!resResp.ok) { console.error("❌ Can't read Firebase:", resResp.status); process.exit(1); }
  let rawResults = await resResp.json() || {};

  // Convert to clean arrays
  let dbResults = {};
  for (const [team, val] of Object.entries(rawResults)) {
    const decoded = decodeURIComponent(team);
    if (Array.isArray(val)) {
      dbResults[decoded] = [...val];
    } else if (val && typeof val === "object") {
      const arr = [];
      for (const [idx, v] of Object.entries(val)) arr[parseInt(idx)] = v;
      dbResults[decoded] = arr;
    }
  }

  const teamsWithResults = Object.entries(dbResults).filter(([_, a]) => a.some(v => v === "Y" || v === "N"));
  console.log(`   ${teamsWithResults.length} teams have results in database\n`);

  // Fetch ESPN games
  const games = await fetchScores();
  console.log(`\n🏟️  Found ${games.length} total tournament games from ESPN\n`);
  if (games.length === 0) { console.log("No games found. Done!"); return; }

  const RN = ["R64", "R32", "Sweet 16", "Elite 8", "Final 4", "Championship"];
  let newWrites = 0, corrections = 0, alreadyCorrect = 0, skippedFF = 0;

  for (const game of games) {
    if (game.round < 0) { skippedFF++; continue; }

    const winnerName = mapName(game.winner);
    const loserName = mapName(game.loser);

    // --- WINNER: should be "Y" in this round ---
    if (winnerName) {
      const existing = (dbResults[winnerName] || [])[game.round];

      if (existing === "Y") {
        // Already correct, do nothing
        alreadyCorrect++;
      } else if (existing === "N") {
        // DATABASE IS WRONG — says L but ESPN says W. Fix it.
        console.log(`  🔧 CORRECTING ${winnerName} in ${RN[game.round]}: DB has L, ESPN says W (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) corrections++;
      } else {
        // Blank — new result
        console.log(`  ✅ NEW: ${winnerName} WIN in ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) newWrites++;
      }
    }

    // --- LOSER: should be "N" in this round ---
    if (loserName) {
      const existing = (dbResults[loserName] || [])[game.round];

      if (existing === "N") {
        alreadyCorrect++;
      } else if (existing === "Y") {
        // DATABASE IS WRONG — says W but ESPN says L. Fix it.
        console.log(`  🔧 CORRECTING ${loserName} in ${RN[game.round]}: DB has W, ESPN says L (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) corrections++;
      } else {
        console.log(`  ❌ NEW: ${loserName} LOSS in ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) newWrites++;
      }
    }
  }

  console.log(`\n🏁 SUMMARY`);
  console.log(`   ✅ ${newWrites} new results written`);
  console.log(`   🔧 ${corrections} corrections made (DB was wrong)`);
  console.log(`   ✓  ${alreadyCorrect} already correct (no change)`);
  console.log(`   ⏭️  ${skippedFF} First Four games skipped`);
  console.log(`\nDone!`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
