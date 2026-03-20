// ESPN NCAA Tournament Score Fetcher v7
// SMART MATCHING + CLEANUP
// - Reads your actual team names from draft
// - ESPN = source of truth
// - Fills blanks, corrects mistakes
// - DELETES results that ESPN has no game for (bad data cleanup)
// - BOTH teams must be in bracket to count as tournament game

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

// Which rounds have finished based on today's date?
function getCompletedRounds() {
  const today = new Date();
  const ymd = parseInt(today.toISOString().slice(0, 10).replace(/-/g, ""));
  const completed = [];
  if (ymd > 20260320) completed.push(0);  // R64 done after Mar 20
  if (ymd > 20260322) completed.push(1);  // R32 done after Mar 22
  if (ymd > 20260327) completed.push(2);  // Sweet 16 done after Mar 27
  if (ymd > 20260329) completed.push(3);  // Elite 8 done after Mar 29
  if (ymd > 20260404) completed.push(4);  // Final Four done after Apr 4
  if (ymd > 20260406) completed.push(5);  // Championship done after Apr 6
  return completed;
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
        // BOTH teams must be in our bracket
        if (!ESPN_KEYWORDS[t1] || !ESPN_KEYWORDS[t2]) continue;
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

async function deleteOneResult(teamName, roundIdx) {
  const safeKey = encodeURIComponent(teamName).replace(/\./g, '%2E');
  const url = `${FIREBASE_DB_URL}/results/${safeKey}/${roundIdx}.json`;
  const res = await fetch(url, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`      ❌ Delete failed for ${teamName} round ${roundIdx}: ${res.status} - ${body}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("🏀 NCAA Tournament Score Updater v7");
  console.log("====================================");
  console.log("ESPN = SOURCE OF TRUTH");
  console.log("Fills blanks + corrects + cleans up bad data\n");

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
  console.log(`   ${teamsWithResults.length} teams have results recorded\n`);

  // Step 3: Fetch ESPN games
  const games = await fetchScores();
  console.log(`\n🏟️  Found ${games.length} tournament games from ESPN\n`);

  // Build a map of what ESPN says: { "teamName": { roundIdx: "Y" or "N" } }
  const espnSays = {};
  const RN = ["R64", "R32", "Sweet 16", "Elite 8", "Final 4", "Championship"];
  let newWrites = 0, corrections = 0, alreadyCorrect = 0, skippedFF = 0, noMatch = 0;

  for (const game of games) {
    if (game.round < 0 || game.isFirstFour) {
      console.log(`  ⏭️  Skip First Four: ${game.winner} vs ${game.loser}`);
      skippedFF++;
      continue;
    }

    const winnerName = findDraftTeam(game.winner, draftTeams);
    const loserName = findDraftTeam(game.loser, draftTeams);

    // Track what ESPN says
    if (winnerName) {
      if (!espnSays[winnerName]) espnSays[winnerName] = {};
      espnSays[winnerName][game.round] = "Y";
    }
    if (loserName) {
      if (!espnSays[loserName]) espnSays[loserName] = {};
      espnSays[loserName][game.round] = "N";
    }

    // --- WINNER ---
    if (winnerName) {
      const existing = (dbResults[winnerName] || [])[game.round];
      if (existing === "Y") { alreadyCorrect++; }
      else if (existing === "N") {
        console.log(`  🔧 CORRECTING ${winnerName} in ${RN[game.round]}: DB has L → ESPN says W (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) corrections++;
      } else {
        console.log(`  ✅ NEW: ${winnerName} WIN in ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        const ok = await writeOneResult(winnerName, game.round, "Y");
        if (ok) newWrites++;
      }
    } else if (game.winner) {
      console.log(`  ⚠️  No match for winner: ${game.winner}`);
      noMatch++;
    }

    // --- LOSER ---
    if (loserName) {
      const existing = (dbResults[loserName] || [])[game.round];
      if (existing === "N") { alreadyCorrect++; }
      else if (existing === "Y") {
        console.log(`  🔧 CORRECTING ${loserName} in ${RN[game.round]}: DB has W → ESPN says L (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) corrections++;
      } else {
        console.log(`  ❌ NEW: ${loserName} LOSS in ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        const ok = await writeOneResult(loserName, game.round, "N");
        if (ok) newWrites++;
      }
    } else if (game.loser) {
      console.log(`  ⚠️  No match for loser: ${game.loser}`);
      noMatch++;
    }
  }

  // Step 4: CLEANUP — find results in DB that ESPN doesn't confirm
  console.log("\n🧹 CLEANUP: Checking for bad data in database...");
  let cleaned = 0;

  for (const [team, arr] of Object.entries(dbResults)) {
    for (let ri = 0; ri < arr.length; ri++) {
      const dbVal = arr[ri];
      if (!dbVal || (dbVal !== "Y" && dbVal !== "N")) continue;

      // Does ESPN have a result for this team in this round?
      const espnVal = espnSays[team]?.[ri];

      if (espnVal) {
        // ESPN has data — already handled above (corrected or confirmed)
        continue;
      }

      // ESPN has NO game for this team in this round
      // This means the DB entry is bad data — delete it
      console.log(`  🗑️  REMOVING ${team} ${RN[ri]}: DB says ${dbVal} but ESPN has no game — deleting`);
      const ok = await deleteOneResult(team, ri);
      if (ok) cleaned++;
    }
  }

  console.log(`\n🏁 SUMMARY`);
  console.log(`   ✅ ${newWrites} new results written`);
  console.log(`   🔧 ${corrections} corrections made`);
  console.log(`   🗑️  ${cleaned} bad entries removed`);
  console.log(`   ✓  ${alreadyCorrect} already correct`);
  console.log(`   ⏭️  ${skippedFF} First Four skipped`);
  console.log(`   ⚠️  ${noMatch} could not match`);
  console.log(`\nDone!`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
