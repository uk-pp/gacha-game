const express=require('express');const path=require('path');const fs=require('fs');
const app=express(),PORT=process.env.PORT||3000,DATA_FILE=path.join(__dirname,'data.json');
const ITEMS=[{id:'target',name:'0.0001%',rate:0.0001,target:true},{id:'super',name:'1%',rate:1,target:false},{id:'rare',name:'13.9999%',rate:13.9999,target:false},{id:'normal',name:'85%',rate:85,target:false}];
function loadData(){if(!fs.existsSync(DATA_FILE))return{};try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch{return{}}}
function saveData(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2))}
function getIp(req){return req.ip||req.socket.remoteAddress||'unknown'}
function getRecords(d){if(!Array.isArray(d.__records))d.__records=[];return d.__records}
function publicRecords(records){return records.map((r,i)=>({rank:i+1,draws:r.draws,at:r.at}))}
function getPlayer(d,ip){if(!d[ip])d[ip]={total:0,rateCounts:{},completed:false};if(!d[ip].rateCounts)d[ip].rateCounts={};if(typeof d[ip].total!=='number')d[ip].total=0;if(typeof d[ip].completed!=='boolean')d[ip].completed=false;return d[ip]}
function drawItem(){const r=Math.random()*100;let sum=0;for(const item of ITEMS){sum+=item.rate;if(r<sum)return item}return ITEMS[ITEMS.length-1]}
app.use(express.json());app.use(express.static(path.join(__dirname,'public')));
app.get('/api/status',(req,res)=>{const d=loadData(),p=getPlayer(d,getIp(req));res.json({totalDraws:p.total,rateCounts:p.rateCounts,completed:p.completed})});
app.get('/api/records',(req,res)=>{const d=loadData();res.json({records:publicRecords(getRecords(d))})});
app.post('/api/draw',(req,res)=>{const d=loadData(),p=getPlayer(d,getIp(req));if(p.completed)return res.status(400).json({error:'completed'});const item=drawItem();p.total++;const k=String(item.rate);p.rateCounts[k]=(p.rateCounts[k]||0)+1;if(item.target===true){p.completed=true;const records=getRecords(d);if(!records.some(r=>r.ip===getIp(req))){records.push({ip:getIp(req),draws:p.total,at:new Date().toISOString()});}}saveData(d);res.json({item,totalDraws:p.total,rateCounts:p.rateCounts,completed:p.completed})});
app.listen(PORT,()=>console.log(`Gacha game running: http://localhost:${PORT}`));
