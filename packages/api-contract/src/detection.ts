const splitHeader = (headerLine: string): string[] => headerLine.split(',').map((column) => column.trim());

export const pt27CardCatalogHeader = splitHeader(
  '//Card Title,Card ID,Card Value,Card Type,Card Sub Type,Card Badge,Card Series,Year,Peak,Team,Franchise,LastName,FirstName,NickName,Nation,UniformNumber,DayOB,MonthOB,YearOB,Bats,Throws,Position,Pitcher Role,Contact,Gap,Power,Eye,Avoid Ks,BABIP,Contact vL,Gap vL,Power vL,Eye vL,Avoid K vL,BABIP vL,Contact vR,Gap vR,Power vR,Eye vR,Avoid K vR,BABIP vR,GB Hitter Type,FB Hitter Type,BattedBallType,Speed,Steal Rate,Stealing,Baserunning,Sac bunt,Bunt for hit,Stuff,Movement,Control,pHR,pBABIP,Stuff vL,Movement vL,Control vL,pHR vL,pBABIP vL,Stuff vR,Movement vR,Control vR,pHR vR,pBABIP vR,Fastball,Slider,Curveball,Changeup,Cutter,Sinker,Splitter,Forkball,Screwball,Circlechange,Knucklecurve,Knuckleball,Stamina,Hold,GB,Velocity,Arm Slot,Height,Infield Range,Infield Error,Infield Arm,DP,CatcherAbil,CatcherFrame,Catcher Arm,OF Range,OF Error,OF Arm,Pos Rating P,Pos Rating C,Pos Rating 1B,Pos Rating 2B,Pos Rating 3B,Pos Rating SS,Pos Rating LF,Pos Rating CF,Pos Rating RF,LearnC,Learn1B,Learn2B,Learn3B,LearnSS,LearnLF,LearnCF,LearnRF,era,tier,MissionValue,limit,owned,brefid,Buy Order High,Sell Order Low,Last 10 Price,Last 10 Price(VAR),date,packs'
);

export const pt27StatsExportHeader = splitHeader(
  'POS,CID,Title,VAL,B,T,TM,VLvl,G,GS,PA,AB,H,1B,2B,3B,HR,RBI,R,BB,IBB,HP,SH,SF,CI,K,GIDP,EBH,TB,RC,RC/27,ISO,OPS+,WPA,wRC,wRC+,wRAA,WAR,PI/PA,SB,CS,BatR,wSB,UBR,BsR,G_1,GS_1,W,L,SVO,SV,BS,HLD,SD,MD,IP,BF,AB_1,HA,1B_1,2B_1,3B_1,HR_1,TB_1,R_1,ER,BB_1,IBB_1,K_1,HP_1,SH_1,SF_1,WP,BK,CI_1,DP,RA,GF,IR,IRS,pLi,QS,CG,SHO,PPG,RS,RSG,PI,GB,FB,SB_1,CS_1,ERA+,FIP,FIP-,WPA_1,WAR_1,rWAR,SIERA,POS_1,G_2,GS_2,TC,A,PO,E,DP_1,TP,RNG,ZR,EFF,SBA,RTO,IP_1,PB,CER,CERA,BIZ-R,BIZ-Rm,BIZ-L,BIZ-Lm,BIZ-E,BIZ-Em,BIZ-U,BIZ-Um,BIZ-Z,BIZ-Zm,BIZ-I,FRM,ARM'
);

const normalizedHeader = (header: string[]): string[] =>
  header.map((column) => column.trim().toLowerCase());

const containsColumns = (header: string[], columns: string[]): boolean => {
  const normalized = new Set(normalizedHeader(header));
  return columns.every((column) => normalized.has(column.trim().toLowerCase()));
};

export const detectPt27CsvKind = (header: string[]): 'card_catalog' | 'stats_export' | 'unknown' => {
  const cardCatalogColumns = ['Card ID', 'Card Type', 'Throws', 'Position', 'tier', 'packs'];
  const statsExportColumns = ['POS', 'CID', 'VLvl', 'PA', 'IP', 'ERA+', 'FRM', 'ARM'];

  if (containsColumns(header, cardCatalogColumns)) {
    return 'card_catalog';
  }

  if (containsColumns(header, statsExportColumns)) {
    return 'stats_export';
  }

  return 'unknown';
};
