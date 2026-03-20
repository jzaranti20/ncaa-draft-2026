// ESPN NCAA Tournament Score Fetcher v8
// - ONLY looks at games on or after March 19, 2026
// - Fills blanks where ESPN has completed games
// - Corrects mismatches (DB wrong vs ESPN)
// - NEVER deletes anything — only writes when ESPN has a confirmed result
// - BOTH teams must be in bracket to count

let FIREBASE_DB_URL = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");

const ESPN_KEYWORDS = {
  "Duke Blue Devils": ["duke"],
  "Siena Saints": ["siena"],
  "Ohio State Buckeyes": ["ohio state", "ohio st"],
  "TCU Horned Frogs": ["tcu"],
  "St. John's Red Storm": ["st. john", "st john"],
  "Northern Iowa Panthers": ["northern iowa"],
  "Kansas Jayhawks": ["kansas"],
  "Cal Baptist Lancers": ["cal baptist"],
  "Louisville Cardinals": ["louisville"],
  "South Florida Bulls": ["south florida", "usf"],
  "Michigan State Spartans": ["michigan state", "michigan st"],
  "North Dakota State Bison": ["north dakota"],
  "UCLA Bruins": ["ucla"],
  "UCF Knights": ["ucf"],
  "UConn Huskies": ["uconn"],
  "Furman Paladins": ["furman"],
  "Arizona Wildcats": ["arizona"],
  "LIU Sharks": ["liu", "long island"],
  "Long Island University Sharks": ["liu", "long island"],
  "Villanova Wildcats": ["villanova"],
  "Utah State Aggies": ["utah state", "utah st"],
  "Wisconsin Badgers": ["wisconsin"],
  "High Point Panthers": ["high point"],
  "Arkansas Razorbacks": ["arkansas"],
  "Hawaii Rainbow Warriors": ["hawai", "hawaii"],
  "Hawai'i Rainbow Warriors": ["hawai", "hawaii"],
  "BYU Cougars": ["byu"],
  "SMU Mustangs": ["smu"],
  "Miami (OH) RedHawks": ["miami (oh)", "miami oh"],
  "Miami Ohio RedHawks": ["miami (oh)", "miami oh"],
  "Gonzaga Bulldogs": ["gonzaga"],
  "Kennesaw State Owls": ["kennesaw"],
  "Miami Hurricanes": ["miami (fl)", "miami hurricanes"],
  "Missouri Tigers": ["missouri"],
  "Purdue Boilermakers": ["purdue"],
  "Queens Royals": ["queens"],
  "Michigan Wolverines": ["michigan wolverines", "michigan wol"],
  "Howard Bison": ["howard"],
  "UMBC Retrievers": ["umbc"],
  "Georgia Bulldogs": ["georgia"],
  "Saint Louis Billikens": ["saint louis", "st. louis"],
  "Vanderbilt Commodores": ["vanderbilt"],
  "McNeese Cowboys": ["mcneese"],
  "Alabama Crimson Tide": ["alabama"],
  "Hofstra Pride": ["hofstra"],
  "Tennessee Volunteers": ["tennessee vol"],
  "Texas Longhorns": ["texas longhorns"],
  "NC State Wolfpack": ["nc state"],
  "Virginia Cavaliers": ["virginia"],
  "Wright State Raiders": ["wright state", "wright st"],
  "Kentucky Wildcats": ["kentucky"],
  "Santa Clara Broncos": ["santa clara"],
  "Iowa State Cyclones": ["iowa state", "iowa st"],
  "Tennessee State Tigers": ["tennessee state", "tennessee st"],
  "Florida Gators": ["florida"],
  "Prairie View A&M Panthers": ["prairie view", "pv a&m", "pv a&amp;m"],
  "Lehigh Mountain Hawks": ["lehigh"],
  "Clemson Tigers": ["clemson"],
  "Iowa Hawkeyes": ["iowa hawkeyes"],
  "Texas Tech Red Raiders": ["texas tech"],
  "Akron Zips": ["akron"],
  "Nebraska Cornhuskers": ["nebraska"],
  "Troy Trojans": ["troy"],
  "North Carolina Tar Heels": ["north carolina"],
  "VCU Rams": ["vcu"],
  "Illinois Fighting Illini": ["illinois"],
  "Penn Quakers": ["penn"],
  "Saint Mary's Gaels": ["saint mary", "st. mary", "st mary"],
  "Texas A&M Aggies": ["texas a&m", "texas a&amp;m"],
  "Houston Cougars": ["houston"],
  "Idaho Vandals": ["idaho"]
};

function getRoundFromDate(dateStr) {
  const d = parseInt(dateStr);
  if (d <= 20260320) return 0;   // R64: Mar 19-20
  if (d <= 20260322) return 1;   // R32: Mar 21-22
  if (d <= 20260327) return 2;   // Sweet 16: Mar 26-27
  if (d <= 20260329) return 3;   // Elite 8: Mar 28-29
  if (d <= 20260404) return 4;   // Final Four: Apr 4
  if (d <= 20260406) return 5;   // Championship: Apr 6
  return -1;
}

function findDraftTeam(espnName, draftTeams) {
  if (!espnName) return null;
  const keywords = ESPN_KEYWORDS[espnName];
  if (!keywords) return null;
  for (const keyword of keywords) {
    for (const dt of draftTeams) {
      const dl = dt.toLowerCase();
      if (dl.includes(keyword) || keyword.includes(dl)) return dt;
    }
  }
  const firstName = espnName.toLowerCase().split(" ")[0];
  const matches = draftTeams.filter(t => t.toLowerCase().startsWith(firstName));
  if (matches.length === 1) return matches[0];
  return null;
}

async function fetchScores() {
  // ONLY check dates from March 19, 2026 onwards
  const START_DATE = new Date("2026-03-19");
  const today = new Date();
  const dates = [];

  let d = new Date(START_DATE);
  while (d <= today) {
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setDate(d.getDate() + 1);
  }

  console.log(`📅 Checking ${dates.length} days (Mar 19 through today)\n`);

  const games = [];
  for (const date of dates) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=100&limit=400`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.events) continue;
      let found = 0;
      for (const event of data.events) {
        if (!event.status?.type?.completed) continue;
        const competitors = event.competitions?.[0]?.competitors || [];
        if (competitors.length !== 2) continue;
        const t1 = competitors[0]?.team?.displayName;
        const t2 = competitors[1]?.team?.displayName;
        // BOTH teams must be in our bracket
        if (!ESPN_KEYWORDS[t1] || !ESPN_KEYWORDS[t2]) continue;
        const winner = competitors.find(c => c.winner);
        const loser = competitors.find(c => !c.winner);
        if (!winner || !loser) continue;
        const roundIdx = getRoundFromDate(date);
        if (roundIdx < 0) continue;
        found++;
        games.push({
          winner: winner.team?.displayName,
          loser: loser.team?.displayName,
          winScore: winner.score,
          loseScore: loser.score,
          round: roundIdx,
          date
        });
      }
      if (found > 0) console.log(`   ${date}: 🏀 ${found} tournament games`);
      else console.log(`   ${date}: no completed tournament games`);
    } catch (err) { console.error(`   ${date}: Error - ${err.message}`); }
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
    console.error(`      ❌ Write failed for ${teamName}: ${res.status} - ${body}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("🏀 NCAA Tournament Score Updater v8");
  console.log("====================================");
  console.log("SAFE: Only writes when ESPN has confirmed results");
  console.log("NEVER deletes — only fills blanks and corrects\n");

  if (!FIREBASE_DB_URL) { console.error("❌ FIREBASE_DATABASE_URL not set!"); process.exit(1); }

  // Step 1: Read draft picks
  console.log("📥 Reading draft picks from Firebase...");
  const draftResp = await fetch(`${FIREBASE_DB_URL}/draft.json`);
  if (!draftResp.ok) { console.error("❌ Can't read draft:", draftResp.status); process.exit(1); }
  const draft = await draftResp.json();
  if (!draft || !draft.picks || draft.picks.length === 0) { console.error("❌ No draft picks found!"); process.exit(1); }
  const draftTeams = [...new Set(draft.picks.map(p => p.team))];
  console.log(`   Found ${draftTeams.length} drafted teams\n`);

  // Step 2: Read current results
  console.log("📥 Reading current results from Firebase...");
  const resResp = await fetch(`${FIREBASE_DB_URL}/results.json`);
  let rawResults = await resResp.json() || {};
  let dbResults = {};
  for (const [team, val] of Object.entries(rawResults)) {
    const decoded = decodeURIComponent(team);
    if (Array.isArray(val)) { dbResults[decoded] = [...val]; }
    else if (val && typeof val === "object") {
      const arr = []; for (const [idx, v] of Object.entries(val)) arr[parseInt(idx)] = v;
      dbResults[decoded] = arr;
    }
  }
  const teamsWithResults = Object.entries(dbResults).filter(([_, a]) => a.some(v => v === "Y" || v === "N"));
  console.log(`   ${teamsWithResults.length} teams have results in DB\n`);

  // Step 3: Fetch ESPN games (Mar 19+ only)
  const games = await fetchScores();
  console.log(`\n🏟️  Total: ${games.length} confirmed tournament games from ESPN\n`);

  if (games.length === 0) {
    console.log("No completed tournament games found yet. Done!");
    return;
  }

  const RN = ["R64", "R32", "Sweet 16", "Elite 8", "Final 4", "Championship"];
  let newWrites = 0, corrections = 0, alreadyCorrect = 0, noMatch = 0;

  for (const game of games) {
    const winnerName = findDraftTeam(game.winner, draftTeams);
    const loserName = findDraftTeam(game.loser, draftTeams);

    // --- WINNER ---
    if (winnerName) {
      const existing = (dbResults[winnerName] || [])[game.round];
      if (existing === "Y") {
        alreadyCorrect++;
      } else if (existing === "N") {
        console.log(`  🔧 CORRECTING ${winnerName} in ${RN[game.round]}: DB=L → ESPN=W (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) corrections++;
      } else {
        console.log(`  ✅ NEW: ${winnerName} WIN in ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) newWrites++;
      }
    } else {
      console.log(`  ⚠️  No draft match for winner: ${game.winner}`);
      noMatch++;
    }

    // --- LOSER ---
    if (loserName) {
      const existing = (dbResults[loserName] || [])[game.round];
      if (existing === "N") {
        alreadyCorrect++;
      } else if (existing === "Y") {
        console.log(`  🔧 CORRECTING ${loserName} in ${RN[game.round]}: DB=W → ESPN=L (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) corrections++;
      } else {
        console.log(`  ❌ NEW: ${loserName} LOSS in ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) newWrites++;
      }
    } else {
      console.log(`  ⚠️  No draft match for loser: ${game.loser}`);
      noMatch++;
    }
  }

  console.log(`\n🏁 SUMMARY`);
  console.log(`   ✅ ${newWrites} new results written`);
  console.log(`   🔧 ${corrections} corrections made`);
  console.log(`   ✓  ${alreadyCorrect} already correct`);
  console.log(`   ⚠️  ${noMatch} could not match to draft`);
  console.log(`\nDone!`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
