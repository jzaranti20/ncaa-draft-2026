const DB_URL = process.env.FIREBASE_DATABASE_URL;

const TEAM_NAMES = {
  "Duke Blue Devils":"Duke","Siena Saints":"Siena","Ohio State Buckeyes":"Ohio State",
  "TCU Horned Frogs":"TCU","St. John's Red Storm":"St. John's","Northern Iowa Panthers":"Northern Iowa",
  "Kansas Jayhawks":"Kansas","Cal Baptist Lancers":"Cal Baptist","Louisville Cardinals":"Louisville",
  "South Florida Bulls":"South Florida","Michigan State Spartans":"Michigan State",
  "North Dakota State Bison":"North Dakota State","UCLA Bruins":"UCLA","UCF Knights":"UCF",
  "UConn Huskies":"UConn","Furman Paladins":"Furman","Arizona Wildcats":"Arizona",
  "LIU Sharks":"LIU","Villanova Wildcats":"Villanova","Utah State Aggies":"Utah State",
  "Wisconsin Badgers":"Wisconsin","High Point Panthers":"High Point","Arkansas Razorbacks":"Arkansas",
  "Hawaii Rainbow Warriors":"Hawai'i","BYU Cougars":"BYU","SMU Mustangs":"SMU",
  "Gonzaga Bulldogs":"Gonzaga","Kennesaw State Owls":"Kennesaw State",
  "Miami Hurricanes":"Miami (FL)","Missouri Tigers":"Missouri","Purdue Boilermakers":"Purdue",
  "Queens Royals":"Queens","Michigan Wolverines":"Michigan","Howard Bison":"Howard",
  "Georgia Bulldogs":"Georgia","Saint Louis Billikens":"Saint Louis",
  "Vanderbilt Commodores":"Vanderbilt","McNeese Cowboys":"McNeese",
  "Alabama Crimson Tide":"Alabama","Hofstra Pride":"Hofstra","Tennessee Volunteers":"Tennessee",
  "Texas Longhorns":"Texas","Virginia Cavaliers":"Virginia","Wright State Raiders":"Wright State",
  "Kentucky Wildcats":"Kentucky","Santa Clara Broncos":"Santa Clara",
  "Iowa State Cyclones":"Iowa State","Tennessee State Tigers":"Tennessee State",
  "Florida Gators":"Florida","Lehigh Mountain Hawks":"Lehigh",
  "Clemson Tigers":"Clemson","Iowa Hawkeyes":"Iowa","Texas Tech Red Raiders":"Texas Tech",
  "Akron Zips":"Akron","Nebraska Cornhuskers":"Nebraska","Troy Trojans":"Troy",
  "North Carolina Tar Heels":"North Carolina","VCU Rams":"VCU",
  "Illinois Fighting Illini":"Illinois","Penn Quakers":"Penn",
  "Saint Mary's Gaels":"Saint Mary's","Texas A&M Aggies":"Texas A&M",
  "Houston Cougars":"Houston","Idaho Vandals":"Idaho"
};

const ROUND_MAP = {"1":0,"2":1,"3":2,"4":3,"5":4,"6":5};

async function run() {
  console.log("Fetching NCAA tournament scores...");
  if (!DB_URL) { console.error("FIREBASE_DATABASE_URL not set"); process.exit(1); }

  const today = new Date();
  const dates = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0,10).replace(/-/g,""));
  }

  const games = [];
  for (const date of dates) {
    try {
      const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates="+date+"&groups=100&limit=200";
      const res = await fetch(url);
      const data = await res.json();
      if (!data.events) continue;
      for (const ev of data.events) {
        if (!ev.status?.type?.completed) continue;
        const notes = (ev.notes||[]).map(n=>(n.headline||"").toLowerCase()).join(" ");
        if (!notes.includes("ncaa") && !notes.includes("tournament")) continue;
        const comps = ev.competitions?.[0]?.competitors||[];
        if (comps.length!==2) continue;
        const winner = comps.find(c=>c.winner);
        const loser = comps.find(c=>!c.winner);
        if (!winner||!loser) continue;
        let round = null;
        if (notes.includes("first round")||notes.includes("1st round")||notes.includes("round of 64")) round=1;
        else if (notes.includes("second round")||notes.includes("2nd round")||notes.includes("round of 32")) round=2;
        else if (notes.includes("sweet 16")||notes.includes("regional semi")) round=3;
        else if (notes.includes("elite 8")||notes.includes("elite eight")||notes.includes("regional final")) round=4;
        else if (notes.includes("final four")||notes.includes("national semi")) round=5;
        else if (notes.includes("championship")||notes.includes("national champ")) round=6;
        if (round) games.push({winner:winner.team?.displayName,loser:loser.team?.displayName,round});
      }
    } catch(e) { console.error("Error fetching "+date+":", e.message); }
  }

  console.log("Found "+games.length+" completed tournament games");
  if (!games.length) return;

  const cur = await fetch(DB_URL+"/results.json").then(r=>r.json()) || {};
  let updates = 0;

  for (const g of games) {
    const ri = ROUND_MAP[String(g.round)];
    if (ri===undefined) continue;
    const wn = TEAM_NAMES[g.winner];
    const ln = TEAM_NAMES[g.loser];
    if (wn) { const a=cur[wn]||[]; if(a[ri]!=="Y"){a[ri]="Y";cur[wn]=a;updates++;console.log("  W "+wn);} }
    if (ln) { const a=cur[ln]||[]; if(a[ri]!=="N"){a[ri]="N";cur[ln]=a;updates++;console.log("  L "+ln);} }
  }

  if (updates > 0) {
    await fetch(DB_URL+"/results.json", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(cur)});
    console.log("Updated "+updates+" results in Firebase");
  } else { console.log("No new updates"); }
}

run().catch(e => { console.error(e); process.exit(1); });
