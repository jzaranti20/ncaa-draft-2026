// ESPN NCAA Tournament Score Fetcher v6
// SMART MATCHING: Reads your actual team names from Firebase draft picks,
// then matches ESPN names to those. No more name mismatches.
// ESPN = source of truth. Fills blanks + corrects mistakes.

let FIREBASE_DB_URL = (process.env.FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");

// Maps ESPN display names to short keywords for fuzzy matching
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

// Special: these ESPN teams should map to the SAME draft slot
// (First Four pairs — both names match the same team in your draft)
const FIRST_FOUR_PAIRS = [
  ["Howard Bison", "UMBC Retrievers"],
  ["Texas Longhorns", "NC State Wolfpack"],
  ["SMU Mustangs", "Miami (OH) RedHawks", "Miami Ohio RedHawks"],
  ["Prairie View A&M Panthers", "Lehigh Mountain Hawks"]
];

function getRoundFromDate(dateStr) {
  const d = parseInt(dateStr);
  if (d <= 20260318) return -1;
  if (d <= 20260320) return 0;
  if (d <= 20260322) return 1;
  if (d <= 20260327) return 2;
  if (d <= 20260329) return 3;
  if (d <= 20260404) return 4;
  if (d <= 20260406) return 5;
  return -1;
}

// Find the best matching team name from the draft
function findDraftTeam(espnName, draftTeams) {
  if (!espnName) return null;
  const espnLower = espnName.toLowerCase();

  // Get keywords for this ESPN name
  const keywords = ESPN_KEYWORDS[espnName];
  if (!keywords) {
    console.log(`   ⚠️  No keywords defined for ESPN name: ${espnName}`);
    return null;
  }

  // Try each keyword against each draft team name
  for (const keyword of keywords) {
    for (const draftTeam of draftTeams) {
      const draftLower = draftTeam.toLowerCase();
      if (draftLower.includes(keyword) || keyword.includes(draftLower)) {
        return draftTeam;
      }
    }
  }

  // Special case: for "Michigan Wolverines" vs "Michigan State Spartans"
  // and "Iowa Hawkeyes" vs "Iowa State Cyclones" etc.
  // Try exact first-word match but only if unambiguous
  const firstName = espnLower.split(" ")[0];
  const matches = draftTeams.filter(t => t.toLowerCase().startsWith(firstName));
  if (matches.length === 1) return matches[0];

  console.log(`   ⚠️  No match for: ${espnName}`);
  return null;
}

// Check if two ESPN teams are a First Four pair
function areFirstFourPair(espn1, espn2) {
  for (const pair of FIRST_FOUR_PAIRS) {
    if (pair.includes(espn1) && pair.includes(espn2)) return true;
  }
  return false;
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
      if (!data.events) continue;
      let found = 0;
      for (const event of data.events) {
        if (!event.status?.type?.completed) continue;
        const competitors = event.competitions?.[0]?.competitors || [];
        if (competitors.length !== 2) continue;
        const t1 = competitors[0]?.team?.displayName;
        const t2 = competitors[1]?.team?.displayName;
        // Quick check: is either team in our ESPN list?
        if (!ESPN_KEYWORDS[t1] && !ESPN_KEYWORDS[t2]) continue;
        const winner = competitors.find(c => c.winner);
        const loser = competitors.find(c => !c.winner);
        if (!winner || !loser) continue;
        const roundIdx = getRoundFromDate(date);
        found++;
        games.push({
          winner: winner.team?.displayName,
          loser: loser.team?.displayName,
          winScore: winner.score,
          loseScore: loser.score,
          round: roundIdx,
          date,
          isFirstFour: areFirstFourPair(winner.team?.displayName, loser.team?.displayName)
        });
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
    console.error(`      ❌ Write failed for ${teamName}: ${res.status} - ${body}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("🏀 NCAA Tournament Score Updater v6");
  console.log("====================================");
  console.log("SMART MATCHING: Reads team names from your draft");
  console.log("ESPN = source of truth\n");

  if (!FIREBASE_DB_URL) { console.error("❌ FIREBASE_DATABASE_URL not set!"); process.exit(1); }

  // Step 1: Read draft picks to get YOUR actual team names
  console.log("📥 Reading draft picks from Firebase...");
  const draftResp = await fetch(`${FIREBASE_DB_URL}/draft.json`);
  if (!draftResp.ok) { console.error("❌ Can't read draft:", draftResp.status); process.exit(1); }
  const draft = await draftResp.json();

  if (!draft || !draft.picks || draft.picks.length === 0) {
    console.error("❌ No draft picks found in database. Draft first!");
    process.exit(1);
  }

  const draftTeams = [...new Set(draft.picks.map(p => p.team))];
  console.log(`   Found ${draftTeams.length} drafted teams\n`);
  console.log("   Teams in your draft:");
  draftTeams.sort().forEach(t => console.log(`      ${t}`));

  // Step 2: Read current results
  console.log("\n📥 Reading current results from Firebase...");
  const resResp = await fetch(`${FIREBASE_DB_URL}/results.json`);
  let rawResults = await resResp.json() || {};

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
  console.log(`   ${teamsWithResults.length} teams have results recorded\n`);

  // Step 3: Fetch ESPN games
  const games = await fetchScores();
  console.log(`\n🏟️  Found ${games.length} tournament games from ESPN\n`);
  if (games.length === 0) { console.log("No games found. Done!"); return; }

  const RN = ["R64", "R32", "Sweet 16", "Elite 8", "Final 4", "Championship"];
  let newWrites = 0, corrections = 0, alreadyCorrect = 0, skippedFF = 0, noMatch = 0;

  for (const game of games) {
    if (game.round < 0 || game.isFirstFour) {
      console.log(`  ⏭️  Skip First Four: ${game.winner} vs ${game.loser}`);
      skippedFF++;
      continue;
    }

    // Match ESPN names to YOUR draft team names
    const winnerName = findDraftTeam(game.winner, draftTeams);
    const loserName = findDraftTeam(game.loser, draftTeams);

    if (winnerName) {
      const existing = (dbResults[winnerName] || [])[game.round];
      if (existing === "Y") {
        alreadyCorrect++;
      } else if (existing === "N") {
        console.log(`  🔧 CORRECTING ${winnerName} in ${RN[game.round]}: DB has L → ESPN says W (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) { corrections++; dbResults[winnerName] = dbResults[winnerName] || []; dbResults[winnerName][game.round] = "Y"; }
      } else {
        console.log(`  ✅ NEW: ${winnerName} WIN in ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) { newWrites++; dbResults[winnerName] = dbResults[winnerName] || []; dbResults[winnerName][game.round] = "Y"; }
      }
    } else {
      console.log(`  ⚠️  Could not match winner: ${game.winner}`);
      noMatch++;
    }

    if (loserName) {
      const existing = (dbResults[loserName] || [])[game.round];
      if (existing === "N") {
        alreadyCorrect++;
      } else if (existing === "Y") {
        console.log(`  🔧 CORRECTING ${loserName} in ${RN[game.round]}: DB has W → ESPN says L (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) { corrections++; dbResults[loserName] = dbResults[loserName] || []; dbResults[loserName][game.round] = "N"; }
      } else {
        console.log(`  ❌ NEW: ${loserName} LOSS in ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) { newWrites++; dbResults[loserName] = dbResults[loserName] || []; dbResults[loserName][game.round] = "N"; }
      }
    } else {
      console.log(`  ⚠️  Could not match loser: ${game.loser}`);
      noMatch++;
    }
  }

  console.log(`\n🏁 SUMMARY`);
  console.log(`   ✅ ${newWrites} new results written`);
  console.log(`   🔧 ${corrections} corrections made`);
  console.log(`   ✓  ${alreadyCorrect} already correct`);
  console.log(`   ⏭️  ${skippedFF} First Four skipped`);
  console.log(`   ⚠️  ${noMatch} could not match (check team names)`);
  console.log(`\nDone!`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
