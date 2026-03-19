// ESPN NCAA Tournament Score Fetcher v2
// Smarter detection: if both teams are in our bracket, it's a tournament game

const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL;

// Maps ESPN display names to our bracket names
const NAME_MAP = {
  // East
  "Duke Blue Devils":"Duke","Siena Saints":"Siena","Ohio State Buckeyes":"Ohio State",
  "TCU Horned Frogs":"TCU","St. John's Red Storm":"St. John's",
  "Northern Iowa Panthers":"Northern Iowa","Kansas Jayhawks":"Kansas",
  "Cal Baptist Lancers":"Cal Baptist","Louisville Cardinals":"Louisville",
  "South Florida Bulls":"South Florida","Michigan State Spartans":"Michigan State",
  "North Dakota State Bison":"North Dakota St","UCLA Bruins":"UCLA",
  "UCF Knights":"UCF","UConn Huskies":"UConn","Furman Paladins":"Furman",
  // West
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
  // Midwest
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
  // South
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

// Try to match an ESPN team name
function mapName(espnName) {
  if (!espnName) return null;
  if (NAME_MAP[espnName]) return NAME_MAP[espnName];
  // Try matching just the display name without mascot
  for (const [key, val] of Object.entries(NAME_MAP)) {
    // Check if ESPN name starts with the same school name
    const school = key.replace(/ (Blue Devils|Saints|Buckeyes|Horned Frogs|Red Storm|Panthers|Jayhawks|Lancers|Cardinals|Bulls|Spartans|Bison|Bruins|Knights|Huskies|Paladins|Wildcats|Sharks|Badgers|Razorbacks|Rainbow Warriors|Cougars|Mustangs|RedHawks|Bulldogs|Owls|Hurricanes|Tigers|Boilermakers|Royals|Wolverines|Retrievers|Billikens|Commodores|Cowboys|Crimson Tide|Pride|Volunteers|Longhorns|Wolfpack|Cavaliers|Raiders|Broncos|Cyclones|Gators|Mountain Hawks|Hawkeyes|Red Raiders|Zips|Cornhuskers|Trojans|Tar Heels|Rams|Fighting Illini|Quakers|Gaels|Aggies|Vandals)$/i, "").trim();
    if (espnName.startsWith(school)) return val;
  }
  return null;
}

// Figure out which round a game is based on the date and tournament schedule
// 2026 NCAA Tournament schedule:
// First Four: Mar 17-18
// R64: Mar 19-20
// R32: Mar 21-22
// Sweet 16: Mar 26-27
// Elite 8: Mar 28-29
// Final Four: Apr 4
// Championship: Apr 6
function getRoundFromDate(dateStr) {
  const d = parseInt(dateStr);
  if (d <= 20260318) return -1;  // First Four — skip
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
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
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
      console.log(`   ${data.events.length} total games found`);

      for (const event of data.events) {
        // Only completed games
        if (!event.status?.type?.completed) continue;

        const competitors = event.competitions?.[0]?.competitors || [];
        if (competitors.length !== 2) continue;

        const team1name = competitors[0]?.team?.displayName;
        const team2name = competitors[1]?.team?.displayName;

        // Check if EITHER team is in our bracket — that means it's a tournament game
        const mapped1 = mapName(team1name);
        const mapped2 = mapName(team2name);

        if (!mapped1 && !mapped2) continue;  // Neither team is in our bracket

        const winner = competitors.find(c => c.winner);
        const loser = competitors.find(c => !c.winner);
        if (!winner || !loser) continue;

        const roundIdx = getRoundFromDate(date);

        console.log(`   🏀 ${winner.team?.displayName} ${winner.score} - ${loser.team?.displayName} ${loser.score} (round: ${roundIdx})`);

        games.push({
          winner: winner.team?.displayName,
          loser: loser.team?.displayName,
          winScore: winner.score,
          loseScore: loser.score,
          round: roundIdx,
          date
        });
      }
    } catch (err) {
      console.error(`   Error: ${err.message}`);
    }
  }
  return games;
}

async function main() {
  console.log("🏀 NCAA Tournament Score Updater v2");
  console.log("====================================\n");

  if (!FIREBASE_DB_URL) {
    console.error("❌ FIREBASE_DATABASE_URL not set!");
    process.exit(1);
  }

  console.log("📥 Reading current results from Firebase...");
  const resResp = await fetch(`${FIREBASE_DB_URL}/results.json`);
  let results = await resResp.json() || {};
  console.log(`   ${Object.keys(results).length} teams with existing results\n`);

  const games = await fetchScores();
  console.log(`\n🏟️  Found ${games.length} tournament games\n`);

  if (games.length === 0) {
    console.log("No tournament games found. Done!");
    return;
  }

  let updates = 0;
  const RN = ["R64","R32","Sweet 16","Elite 8","Final 4","Championship"];

  for (const game of games) {
    if (game.round < 0) {
      console.log(`  ⏭️  Skipping (First Four or out of range): ${game.winner} vs ${game.loser}`);
      continue;
    }

    const winnerName = mapName(game.winner);
    const loserName = mapName(game.loser);

    if (winnerName) {
      const arr = results[winnerName] || [];
      if (arr[game.round] !== "Y") {
        arr[game.round] = "Y";
        results[winnerName] = arr;
        console.log(`  ✅ ${winnerName} WIN in ${RN[game.round]} (${game.winScore}-${game.loseScore})`);
        updates++;
      }
    }

    if (loserName) {
      const arr = results[loserName] || [];
      if (arr[game.round] !== "N") {
        arr[game.round] = "N";
        results[loserName] = arr;
        console.log(`  ❌ ${loserName} LOSS in ${RN[game.round]} (${game.loseScore}-${game.winScore})`);
        updates++;
      }
    }
  }

  if (updates > 0) {
    console.log(`\n📝 Writing ${updates} updates to Firebase...`);
    const wr = await fetch(`${FIREBASE_DB_URL}/results.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results),
    });
    if (wr.ok) console.log("✅ Firebase updated! Scores are live.");
    else console.error("❌ Write failed:", wr.status);
  } else {
    console.log("\n✅ Already up to date.");
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
