// ESPN NCAA Tournament Score Fetcher v3
// Fixes: strips trailing slash from URL, writes per-team, better errors

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
  if (d <= 20260318) return -1;
  if (d <= 20260320) return 0;
  if (d <= 20260322) return 1;
  if (d <= 20260327) return 2;
  if (d <= 20260329) return 3;
  if (d <= 20260404) return 4;
  if (d <= 20260406) return 5;
  return -1;
}

async function fetchScores() {
  const today = new Date();
  const dates = [];
  for (let i = 7; i >= 0; i--) {
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
      console.log(`   ${data.events.length} games on this date`);
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
        console.log(`   🏀 ${winner.team?.displayName} ${winner.score} - ${loser.team?.displayName} ${loser.score} (round: ${roundIdx})`);
        games.push({ winner: winner.team?.displayName, loser: loser.team?.displayName, winScore: winner.score, loseScore: loser.score, round: roundIdx, date });
      }
    } catch (err) { console.error(`   Error: ${err.message}`); }
  }
  return games;
}

// Write a single team's results to Firebase
async function writeTeamResult(teamName, resultArray) {
  // Firebase keys can't have . $ # [ ] / so encode the team name
  const safeKey = encodeURIComponent(teamName).replace(/\./g, '%2E');
  const url = `${FIREBASE_DB_URL}/results/${safeKey}.json`;
  
  // Convert array to object to avoid Firebase array issues
  // e.g. {0: "Y"} instead of ["Y"]
  const obj = {};
  resultArray.forEach((v, i) => { if (v) obj[String(i)] = v; });
  
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`   ❌ Failed to write ${teamName}: ${res.status} - ${body}`);
    return false;
  }
  return true;
}

async function main() {
  console.log("🏀 NCAA Tournament Score Updater v3");
  console.log("====================================\n");
  console.log(`📡 Firebase URL: ${FIREBASE_DB_URL.substring(0, 30)}...`);

  if (!FIREBASE_DB_URL) { console.error("❌ FIREBASE_DATABASE_URL not set!"); process.exit(1); }

  // Test Firebase connection first
  console.log("\n📥 Testing Firebase connection...");
  try {
    const testRes = await fetch(`${FIREBASE_DB_URL}/results.json`);
    console.log(`   Connection status: ${testRes.status}`);
    if (!testRes.ok) {
      const body = await testRes.text();
      console.error(`   ❌ Firebase read failed: ${body}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`   ❌ Cannot reach Firebase: ${err.message}`);
    process.exit(1);
  }

  // Read current results
  const resResp = await fetch(`${FIREBASE_DB_URL}/results.json`);
  let rawResults = await resResp.json() || {};
  
  // Convert Firebase objects back to arrays
  let results = {};
  for (const [team, val] of Object.entries(rawResults)) {
    const decodedTeam = decodeURIComponent(team);
    if (Array.isArray(val)) {
      results[decodedTeam] = val;
    } else if (val && typeof val === "object") {
      const arr = [];
      for (const [idx, v] of Object.entries(val)) { arr[parseInt(idx)] = v; }
      results[decodedTeam] = arr;
    }
  }
  console.log(`   ${Object.keys(results).length} teams with existing results\n`);

  const games = await fetchScores();
  console.log(`\n🏟️  Found ${games.length} tournament games\n`);
  if (games.length === 0) { console.log("No games. Done!"); return; }

  const RN = ["R64", "R32", "Sweet 16", "Elite 8", "Final 4", "Championship"];
  let updates = 0;
  const toWrite = {};

  for (const game of games) {
    if (game.round < 0) {
      console.log(`  ⏭️  Skip First Four: ${game.winner} vs ${game.loser}`);
      continue;
    }

    const winnerName = mapName(game.winner);
    const loserName = mapName(game.loser);

    if (winnerName) {
      const arr = results[winnerName] || [];
      if (arr[game.round] !== "Y") {
        arr[game.round] = "Y";
        results[winnerName] = arr;
        toWrite[winnerName] = arr;
        console.log(`  ✅ ${winnerName} WIN in ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        updates++;
      }
    }
    if (loserName) {
      const arr = results[loserName] || [];
      if (arr[game.round] !== "N") {
        arr[game.round] = "N";
        results[loserName] = arr;
        toWrite[loserName] = arr;
        console.log(`  ❌ ${loserName} LOSS in ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        updates++;
      }
    }
  }

  if (updates > 0) {
    console.log(`\n📝 Writing ${updates} updates to Firebase (one team at a time)...\n`);
    let success = 0, fail = 0;
    for (const [team, arr] of Object.entries(toWrite)) {
      const ok = await writeTeamResult(team, arr);
      if (ok) { success++; console.log(`   ✅ Wrote ${team}`); }
      else fail++;
    }
    console.log(`\n🏁 Done: ${success} written, ${fail} failed`);
  } else {
    console.log("\n✅ Already up to date.");
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
