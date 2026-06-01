'use client';

import { useState, useEffect, useRef, useCallback } from "react";

const INIT_JUDOKAS = [
  { id:1, name:"יואב כ׳",  color:"white", personalDrills:[{id:101,name:"נאגה גדן שמאל",duration:180},{id:102,name:"אוצ׳י גארי",duration:120}]},
  { id:2, name:"ניר ל׳",   color:"blue",  personalDrills:[{id:201,name:"סאיה נאגה",duration:180},{id:202,name:"קו-סוטו גארי",duration:120}]},
  { id:3, name:"שיר מ׳",   color:"white", personalDrills:[{id:301,name:"אוצ׳ימטה",duration:150}]},
  { id:4, name:"תום א׳",   color:"blue",  personalDrills:[{id:401,name:"קו-אוצ׳י גארי",duration:150}]},
  { id:5, name:"עידן ב׳",  color:"white", personalDrills:[{id:501,name:"סיאו-אוצ׳י",duration:120}]},
  { id:6, name:"גל ש׳",    color:"blue",  personalDrills:[{id:601,name:"טאיו-נאגה",duration:120}]},
];
const INIT_PAIRS = [[1,2],[3,4],[5,6]];
const INIT_DRILLS = [
  { id:1, name:"חימום כללי",      duration:300, type:"group",   note:"ריצה + תנועתיות" },
  { id:2, name:"נפילות – Ukemi",  duration:240, type:"group",   note:"אחיבת אחורה, צדדים" },
  { id:3, name:"נאגה גדן",         duration:360, type:"partner", note:"זריקה לצד שמאל", activeColor:"white" },
  { id:4, name:"אוצ׳י גארי",       duration:360, type:"partner", note:"נשענים חזרה",    activeColor:"blue"  },
  { id:5, name:"ראנדורי עמידה",   duration:300, type:"partner", note:"50% עוצמה",      activeColor:"both"  },
  { id:6, name:"עבודה אישית",      duration:300, type:"personal",note:"כל אחד על התרגיל שלו"},
  { id:7, name:"ראנדורי קרקע",    duration:300, type:"partner", note:"100% מאמץ",      activeColor:"both"  },
  { id:8, name:"שוֹשין",            duration:180, type:"group",   note:"מדיטציה וסיכום" },
];

const fmt = s => {
  const neg=s<0, abs=Math.abs(s);
  return `${neg?"-":""}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`;
};

const TYPE_LABEL = { group:"קבוצה", partner:"זוגות", personal:"אישי" };
const TYPE_COLOR = { group:"#6ec6ff", partner:"#FF6B00", personal:"#a8ff78" };

