// Starting data for a fresh install — a sample workout and team.

export const INIT_JUDOKAS = [
  { id:1, name:"יואב כ׳",  color:"white", personalDrills:[{id:101,name:"נאגה גדן שמאל",duration:180},{id:102,name:"אוצ׳י גארי",duration:120}]},
  { id:2, name:"ניר ל׳",   color:"blue",  personalDrills:[{id:201,name:"סאיה נאגה",duration:180},{id:202,name:"קו-סוטו גארי",duration:120}]},
  { id:3, name:"שיר מ׳",   color:"white", personalDrills:[{id:301,name:"אוצ׳ימטה",duration:150}]},
  { id:4, name:"תום א׳",   color:"blue",  personalDrills:[{id:401,name:"קו-אוצ׳י גארי",duration:150}]},
  { id:5, name:"עידן ב׳",  color:"white", personalDrills:[{id:501,name:"סיאו-אוצ׳י",duration:120}]},
  { id:6, name:"גל ש׳",    color:"blue",  personalDrills:[{id:601,name:"טאיו-נאגה",duration:120}]},
];
export const INIT_PAIRS = [[1,2],[3,4],[5,6]];
export const INIT_DRILLS = [
  { id:1, name:"חימום כללי",    section:"warmup",    durationWork:300, durationRest:0,  rounds:1, pattern:"together",  restTiming:"none",        activeColor:"both",  type:"group",    note:"ריצה + תנועתיות",         autoNext:true  },
  { id:2, name:"נאגה גדן",      section:"technique", durationWork:60,  durationRest:15, rounds:5, pattern:"alternate", restTiming:"after_each",  activeColor:"white", type:"partner",  note:"זריקה לצד שמאל",          autoNext:true  },
  { id:3, name:"מנוחה",         section:"rest",      durationWork:60,  durationRest:0,  rounds:1, pattern:"together",  restTiming:"none",        activeColor:"both",  type:"rest",     note:"",                         autoNext:true  },
  { id:4, name:"ראנדורי עמידה", section:"randori",   durationWork:300, durationRest:60, rounds:3, pattern:"together",  restTiming:"after_round", activeColor:"both",  type:"partner",  note:"50% עוצמה",                autoNext:false },
  { id:5, name:"עבודה אישית",   section:"mixed",     durationWork:300, durationRest:0,  rounds:1, pattern:"together",  restTiming:"none",        activeColor:"both",  type:"personal", note:"כל אחד על התרגיל שלו",    autoNext:false },
];
