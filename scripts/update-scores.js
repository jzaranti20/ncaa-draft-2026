// ESPN NCAA Tournament Score Fetcher v9
// FIXED MATCHING: picks most specific draft team name, no false positives
// Only games Mar 19+, both teams in bracket, never deletes

let FIREBASE_DB_URL = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");

const ESPN_KEYWORDS = {
  "Duke Blue Devils": ["duke"],
  "Siena Saints": ["siena"],
  "Ohio State Buckeyes": ["ohio state"],
  "TCU Horned Frogs": ["tcu"],
  "St. John's Red Storm": ["st. john", "st john","St. John's"],
  "Northern Iowa Panthers": ["northern iowa"],
  "Kansas Jayhawks": ["kansas"],
  "Cal Baptist Lancers": ["cal baptist"],
  "Louisville Cardinals": ["louisville"],
  "South Florida Bulls": ["south florida"],
  "Michigan State Spartans": ["michigan state"],
  "North Dakota State Bison": ["north dakota"],
  "UCLA Bruins": ["ucla"],
  "UCF Knights": ["ucf"],
  "UConn Huskies": ["uconn"],
  "Furman Paladins": ["furman"],
  "Arizona Wildcats": ["arizona"],
  "LIU Sharks": ["liu"],
  "Long Island University Sharks": ["liu"],
  "Villanova Wildcats": ["villanova"],
  "Utah State Aggies": ["utah state"],
  "Wisconsin Badgers": ["wisconsin"],
  "High Point Panthers": ["high point"],
  "Arkansas Razorbacks": ["arkansas"],
  "Hawaii Rainbow Warriors": ["hawai", "hawaii"],
  "Hawai'i Rainbow Warriors": ["hawai", "hawaii"],
  "BYU Cougars": ["byu"],
  "SMU Mustangs": ["smu"],
  "Miami (OH) RedHawks": ["miami (oh)"],
  "Miami Ohio RedHawks": ["miami (oh)", "miami oh","Miami (OH) / SMU"],
  "Gonzaga Bulldogs": ["gonzaga"],
  "Kennesaw State Owls": ["kennesaw"],
  "Miami Hurricanes": ["miami (fl)"],
  "Missouri Tigers": ["missouri"],
  "Purdue Boilermakers": ["purdue"],
  "Queens Royals": ["queens"],
  "Michigan Wolverines": ["michigan wol"],
  "Howard Bison": ["howard"],
  "UMBC Retrievers": ["umbc"],
  "Georgia Bulldogs": ["georgia bul", "georgia"],
  "Saint Louis Billikens": ["saint louis"],
  "Vanderbilt Commodores": ["vanderbilt"],
  "McNeese Cowboys": ["mcneese"],
  "Alabama Crimson Tide": ["alabama"],
  "Hofstra Pride": ["hofstra"],
  "Tennessee Volunteers": ["tennessee vol"],
  "Texas Longhorns": ["texas long", "texas lo", "Texas"],
  "NC State Wolfpack": ["nc state"],
  "Virginia Cavaliers": ["virginia cav", "virginia"],
  "Wright State Raiders": ["wright state"],
  "Kentucky Wildcats": ["kentucky"],
  "Santa Clara Broncos": ["santa clara"],
  "Iowa State Cyclones": ["iowa state"],
  "Tennessee State Tigers": ["tennessee state"],
  "Florida Gators": ["florida gator", "florida"],
  "Prairie View A&M Panthers": ["prairie view", "PV A&M"],
  "Lehigh Mountain Hawks": ["lehigh"],
  "Clemson Tigers": ["clemson"],
  "Iowa Hawkeyes": ["iowa hawk", "iowa hawkeyes"],
  "Texas Tech Red Raiders": ["texas tech"],
  "Akron Zips": ["akron"],
  "Nebraska Cornhuskers": ["nebraska"],
  "Troy Trojans": ["troy"],
  "North Carolina Tar Heels": ["north carolina"],
  "VCU Rams": ["vcu"],
  "Illinois Fighting Illini": ["illinois"],
  "Penn Quakers": ["penn qua", "Penn"],
  "Saint Mary's Gaels": ["saint mary"],
  "Texas A&M Aggies": ["texas a&m", "texas a&amp;m"],
  "Houston Cougars": ["houston"],
  "Idaho Vandals": ["idaho"]
};

function getRoundFromDate(dateStr) {
  const d = parseInt(dateStr);
  if (d <= 20260320) return 0;
  if (d <= 20260322) return 1;
  if (d <= 20260327) return 2;
  if (d <= 20260329) return 3;
  if (d <= 20260404) return 4;
  if (d <= 20260406) return 5;
  return -1;
}

function findDraftTeam(espnName, draftTeams) {
  if (!espnName) return null;
  const keywords = ESPN_KEYWORDS[espnName];
  if (!keywords) {
    console.log(`   ⚠️  ESPN name not in keyword list: ${espnName}`);
    return null;
  }

  // Collect ALL possible matches with their specificity score
  let bestMatch = null;
  let bestScore = 0;

  for (const keyword of keywords) {
    for (const dt of draftTeams) {
      const dl = dt.toLowerCase();
      const kl = keyword.toLowerCase();

      // Draft name must contain the keyword (not the other way around!)
      // "south florida" contains "south florida" ✓
      // "florida" contains "south florida" ✗
      if (dl.includes(kl)) {
        // Score = how specific the match is (longer keyword = better match)
        // Bonus if lengths are very close (exact match)
        const score = kl.length * 10 + (100 - Math.abs(dl.length - kl.length));
        if (score > bestScore) {
          bestScore = score;
          bestMatch = dt;
        }
      }

      // Also check: keyword contains draft name BUT only if exact match
      // e.g. keyword "florida gator" for draft team "Florida" — only if no better match exists
      if (!bestMatch && kl.includes(dl) && dl.length > 3) {
        const score = dl.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = dt;
        }
      }
    }
  }

  if (bestMatch) return bestMatch;

  console.log(`   ⚠️  No match for: ${espnName}`);
  return null;
}

async function fetchScores() {
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
        // BOTH teams must be in our ESPN keyword list
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
  console.log("🏀 NCAA Tournament Score Updater v9");
  console.log("====================================");
  console.log("SMART MATCHING: picks most specific team name");
  console.log("ESPN = source of truth, never deletes\n");

  if (!FIREBASE_DB_URL) { console.error("❌ FIREBASE_DATABASE_URL not set!"); process.exit(1); }

  // Step 1: Read draft
  console.log("📥 Reading draft picks from Firebase...");
  const draftResp = await fetch(`${FIREBASE_DB_URL}/draft.json`);
  if (!draftResp.ok) { console.error("❌ Can't read draft:", draftResp.status); process.exit(1); }
  const draft = await draftResp.json();
  if (!draft || !draft.picks || draft.picks.length === 0) { console.error("❌ No draft picks!"); process.exit(1); }
  const draftTeams = [...new Set(draft.picks.map(p => p.team))];
  console.log(`   Found ${draftTeams.length} drafted teams`);

  // Log all draft team names so we can verify matching
  console.log("\n   YOUR DRAFT TEAMS:");
  draftTeams.sort().forEach(t => console.log(`      "${t}"`));

  // Step 2: Read results
  console.log("\n📥 Reading current results from Firebase...");
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

  // Step 3: Test matching before doing anything
  console.log("\n🔍 MATCHING TEST (ESPN name → your draft name):");
  const testNames = [
    "Florida Gators", "South Florida Bulls", "Texas Longhorns",
    "Michigan Wolverines", "Michigan State Spartans",
    "Iowa Hawkeyes", "Iowa State Cyclones",
    "Tennessee Volunteers", "Tennessee State Tigers",
    "Miami Hurricanes", "Miami (OH) RedHawks",
    "Georgia Bulldogs", "Virginia Cavaliers",
    "Texas Tech Red Raiders", "Texas A&M Aggies"
  ];
  for (const tn of testNames) {
    const match = findDraftTeam(tn, draftTeams);
    console.log(`   ${tn} → ${match || "NO MATCH"}`);
  }

  // Step 4: Fetch games
  console.log("");
  const games = await fetchScores();
  console.log(`\n🏟️  Total: ${games.length} confirmed tournament games\n`);

  if (games.length === 0) { console.log("No games. Done!"); return; }

  const RN = ["R64", "R32", "Sweet 16", "Elite 8", "Final 4", "Championship"];
  let newWrites = 0, corrections = 0, alreadyCorrect = 0, noMatch = 0;

  for (const game of games) {
    const winnerName = findDraftTeam(game.winner, draftTeams);
    const loserName = findDraftTeam(game.loser, draftTeams);

    if (!winnerName) { console.log(`  ⚠️  No match: ${game.winner}`); noMatch++; }
    if (!loserName) { console.log(`  ⚠️  No match: ${game.loser}`); noMatch++; }

    // WINNER
    if (winnerName) {
      const existing = (dbResults[winnerName] || [])[game.round];
      if (existing === "Y") { alreadyCorrect++; }
      else if (existing === "N") {
        console.log(`  🔧 FIX ${winnerName} ${RN[game.round]}: DB=L → ESPN=W (${game.winScore}-${game.loseScore})`);
        if (await writeOneResult(winnerName, game.round, "Y")) corrections++;
      } else {
        console.log(`  ✅ NEW: ${winnerName} WIN ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        if (await writeOneResult(winnerName, game.round, "Y")) newWrites++;
      }
    }

    // LOSER
    if (loserName) {
      const existing = (dbResults[loserName] || [])[game.round];
      if (existing === "N") { alreadyCorrect++; }
      else if (existing === "Y") {
        console.log(`  🔧 FIX ${loserName} ${RN[game.round]}: DB=W → ESPN=L (${game.loseScore}-${game.winScore})`);
        if (await writeOneResult(loserName, game.round, "N")) corrections++;
      } else {
        console.log(`  ❌ NEW: ${loserName} LOSS ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        if (await writeOneResult(loserName, game.round, "N")) newWrites++;
      }
    }
  }

  console.log(`\n🏁 SUMMARY`);
  console.log(`   ✅ ${newWrites} new results written`);
  console.log(`   🔧 ${corrections} corrections made`);
  console.log(`   ✓  ${alreadyCorrect} already correct`);
  console.log(`   ⚠️  ${noMatch} could not match`);
  console.log(`\nDone!`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
