const fs=require('fs');const W=require(process.env.ESSENTIA + '/dist/essentia-wasm.umd.js');const Essentia=require(process.env.ESSENTIA + '/dist/essentia.js-core.umd.js');
const {chordCheck}=require('./chordcheck.cjs');const [a0,a1,N]=process.argv.slice(2).map(Number);
(async()=>{await new Promise(r=>{if(W.calledRun)r();else W.onRuntimeInitialized=r;});const e=new Essentia(W);
const meta=JSON.parse(fs.readFileSync('tail.json'));const SR=meta.sr,LEN=meta.len;const fd=fs.openSync('tail.f32','r');const out=[];
for(let i=a0;i<a1;i++){const buf=Buffer.alloc(LEN*4);fs.readSync(fd,buf,0,LEN*4,i*LEN*4);const x=new Float32Array(buf.buffer,buf.byteOffset,LEN);
 const r=[];for(let k=2;k<=20;k++){const s=Math.round((meta.on+k*0.05-N/SR)*SR);const c=chordCheck(e,W,x.slice(s,s+N),SR,meta.scenes[i].expected);r.push([c.ok?1:0,+c.score.toFixed(3),c.chord]);}out.push({i,r});}
fs.writeFileSync(`e2e_${N}_${a0}.json`,JSON.stringify(out));})().catch(err=>{console.log('ERR',err);process.exit(1)});
