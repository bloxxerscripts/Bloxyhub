constexpress=require("express");
constcrypto=require("crypto");

constapp=express();

app.use(express.json());

constPORT=process.env.PORT||3000;

//============================================================
//CONFIG
//============================================================

//PutyourREALLootLabslinkhere.
//
//Example:
//https://loot-link.com/s?abcdef
//
constLOOTLABS_LINK_BASE=
process.env.LOOTLABS_LINK_BASE||
"https://loot-link.com/s?YOUR_LOOTLABS_ID";

//Howlonggeneratedkeysremainvalid.
//12hours=12*60*60*1000
constKEY_LIFETIME=12*60*60*1000;

//HowlonganunfinishedLootLabsclaimremainsvalid.
//ThispreventsoldclaimIDsfromstayingaroundforever.
constCLAIM_LIFETIME=30*60*1000;

//============================================================
//TEMPORARYDATABASE
//============================================================
//
//claims:
//claimId->{
//userId,
//createdAt,
//completed,
//uniqueId
//}
//
//keys:
//key->{
//userId,
//createdAt,
//expiresAt
//}
//
//NOTE:
//Thisismemory-based.Ifyourhostingservicerestarts,
//thesevaluesdisappear.
//
//Later,thiscanbemovedtoadatabase.
//============================================================

constclaims=newMap();
constkeys=newMap();

//============================================================
//HELPERS
//============================================================

functioncreateRandomId(bytes=16){
returncrypto.randomBytes(bytes).toString("hex");
}

functioncreateKey(){
return(
"BLOXY-"+
crypto.randomBytes(8).toString("hex").toUpperCase()
);
}

functioncleanOldData(){
constnow=Date.now();

//Removeexpiredclaims
for(const[claimId,claim]ofclaims.entries()){
if(now-claim.createdAt>CLAIM_LIFETIME){
claims.delete(claimId);
}
}

//Removeexpiredkeys
for(const[key,keyData]ofkeys.entries()){
if(now>keyData.expiresAt){
keys.delete(key);
}
}
}

//Cleanolddataevery5minutes
setInterval(cleanOldData,5*60*1000);

//============================================================
//HOME
//============================================================

app.get("/",(req,res)=>{
res.status(200).send("BloxyHubKeySystemBackendisLive!");
});

//============================================================
//GETLOOTLABSLINK
//============================================================
//
//Robloxcalls:
//
//GET/api/get-link?userId=123456
//
//TheservercreatesarandomclaimID.
//
//ExamplereturnedURL:
//
//https://loot-link.com/s?abcdef&puid=RANDOM_CLAIM_ID
//
//LootLabslatersendsthatpuidbacktousas:
//click_id=RANDOM_CLAIM_ID
//============================================================

app.get("/api/get-link",(req,res)=>{
constuserId=String(req.query.userId||"").trim();

if(!userId){
returnres.status(400).json({
success:false,
error:"MissinguserIdparameter"
});
}

//Basicvalidation
if(!/^\d+$/.test(userId)){
returnres.status(400).json({
success:false,
error:"InvalidRobloxuserId"
});
}

//CreatearandomclaimID
constclaimId=createRandomId(18);

claims.set(claimId,{
userId,
createdAt:Date.now(),
completed:false,
uniqueId:null
});

//AddpuidtotheLootLabslink
constseparator=LOOTLABS_LINK_BASE.includes("?")
?"&"
:"?";

constlootLabsLink=
`${LOOTLABS_LINK_BASE}${separator}puid=${encodeURIComponent(claimId)}`;

console.log(
`[ClaimCreated]UserID=${userId}ClaimID=${claimId}`
);

returnres.json({
success:true,
link:lootLabsLink
});
});

//============================================================
//LOOTLABSPOSTBACK
//============================================================
//
//LootLabscallsthisaftertheusercompletesthetasks.
//
//ConfigureyourLootLabspostbackas:
//
//https://YOUR-DOMAIN.com/api/lootlabs-postback?click_id={CLICK_ID}&ip={IP}&unique_id={UNIQUE_ID}
//
//LootLabssends:
//click_id
//ip
//unique_id
//
//click_idisthepuidweoriginallycreated.
//============================================================

app.get("/api/lootlabs-postback",(req,res)=>{
constclickId=String(req.query.click_id||"").trim();
constuniqueId=String(req.query.unique_id||"").trim();
constip=String(req.query.ip||"").trim();

if(!clickId){
console.warn("[LootLabs]Missingclick_id");

returnres.status(400).send("Missingclick_id");
}

constclaim=claims.get(clickId);

if(!claim){
console.warn(
`[LootLabs]Unknownclaim:${clickId}`
);

returnres.status(404).send("Unknownclaim");
}

//Preventthesameclaimfrombeingprocessedtwice
if(claim.completed){
console.log(
`[LootLabs]Claimalreadycompleted:${clickId}`
);

returnres.status(200).send("OK");
}

//Markclaimascompleted
claim.completed=true;
claim.uniqueId=uniqueId||null;
claim.completedAt=Date.now();
claim.ip=ip||null;

//GeneratetheactualBloxyHubkey
constgeneratedKey=createKey();

constcreatedAt=Date.now();
constexpiresAt=createdAt+KEY_LIFETIME;

keys.set(generatedKey,{
userId:claim.userId,
createdAt,
expiresAt,
claimId:clickId,
uniqueId:uniqueId||null
});

console.log(
`[KeyGenerated]Key=${generatedKey}UserID=${claim.userId}`
);

//LootLabssuccessfullyreachedthecallback
returnres.status(200).send("OK");
});

//============================================================
//CHECKCLAIMSTATUS
//============================================================
//
//ThisisusefulbecausetheRobloxplayerwon'treceivethe
//generatedkeydirectlyfromtheLootLabspostback.
//
//Robloxcanpoll:
//
//GET/api/claim-status?claimId=XXXX
//
//OnceLootLabsfinishesthetask,thisendpointreturnsthekey.
//============================================================

app.get("/api/claim-status",(req,res)=>{
constclaimId=String(req.query.claimId||"").trim();

if(!claimId){
returnres.status(400).json({
success:false,
error:"MissingclaimId"
});
}

constclaim=claims.get(claimId);

if(!claim){
returnres.status(404).json({
success:false,
error:"Claimnotfoundorexpired"
});
}

if(!claim.completed){
returnres.json({
success:true,
completed:false,
message:"LootLabstaskhasnotbeencompletedyet"
});
}

//Findthekeybelongingtothisclaim
letfoundKey=null;

for(const[key,keyData]ofkeys.entries()){
if(keyData.claimId===claimId){
foundKey=key;
break;
}
}

if(!foundKey){
returnres.status(404).json({
success:false,
error:"Keynotfound"
});
}

constkeyData=keys.get(foundKey);

if(Date.now()>keyData.expiresAt){
keys.delete(foundKey);

returnres.json({
success:false,
completed:true,
error:"Keyexpired"
});
}

returnres.json({
success:true,
completed:true,
key:foundKey,
expiresAt:keyData.expiresAt
});
});

//============================================================
//VERIFYKEY
//============================================================
//
//Robloxcalls:
//
//GET/api/verify-key?userId=123456&key=BLOXY-XXXXXXXX
//
//Thekeymust:
//1.Exist
//2.Notbeexpired
//3.BelongtothesameRobloxuser
//============================================================

app.get("/api/verify-key",(req,res)=>{
constuserId=String(req.query.userId||"").trim();
constkey=String(req.query.key||"").trim();

if(!userId||!key){
returnres.json({
valid:false,
message:"Missingparameters"
});
}

constkeyData=keys.get(key);

if(!keyData){
returnres.json({
valid:false,
message:"Invalidkey"
});
}

//Checkexpiration
if(Date.now()>keyData.expiresAt){
keys.delete(key);

returnres.json({
valid:false,
message:"Keyexpired"
});
}

//Checkownership
if(keyData.userId!==userId){
returnres.json({
valid:false,
message:"Keybelongstoanotheruser"
});
}

returnres.json({
valid:true,
message:"AccessGranted",
expiresAt:keyData.expiresAt
});
});

//============================================================
//HEALTHCHECK
//============================================================

app.get("/api/health",(req,res)=>{
returnres.json({
online:true,
service:"BloxyHubKeySystem",
claims:claims.size,
activeKeys:keys.size
});
});

//============================================================
//STARTSERVER
//============================================================

app.listen(PORT,()=>{
console.log(
`BloxyHubKeySystemrunningonport${PORT}`
);
});
