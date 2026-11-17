// Hinge-swing check: sweeps the opening lid about the hinge axis in 2D (Y,Z
// profile slices at the lid knuckle, a box knuckle and a side rim) and fails if
// any part of the lid enters the box. Run with `pnpm run check:hinge`.
// Constants below mirror boxGenerator.ts (HINGE_*).
// 2D (Y,Z) swept-collision check of the lid opening about the hinge axis.
// mirrors constants in boxGenerator.ts
const GAP=0.3, DROP=0.2, INSET=0.3, HGAP=0.2
type Sh = (y:number,z:number)=>boolean
const rect=(y0:number,y1:number,z0:number,z1:number):Sh=>(y,z)=>y>y0&&y<y1&&z>z0&&z<z1
const disc=(cy:number,cz:number,r:number):Sh=>(y,z)=>(y-cy)**2+(z-cz)**2<r*r
const any=(...s:Sh[]):Sh=>(y,z)=>s.some(f=>f(y,z))
import { hingeRimBackLimit, hingeInsertDepth } from '../src/utils/boxGenerator'
import { DEFAULTS } from '../src/utils/projectStorage'
export function run(o:{depth:number,height:number,wt:number,D:number,ins:number,tol:number}){
  const {depth,height,wt,D,tol}=o;
  const ins=hingeInsertDepth({...DEFAULTS,includeLid:true,includeHinge:true,depth,height,wallThickness:wt,hingeDiameter:D,hingeInsertDepth:o.ins,lidTolerance:tol}); const R=D/2, d2=depth/2, h2=height/2
  const yA=d2+R+GAP, a=h2+wt-R-DROP
  const armH=Math.max(1,Math.min(wt+10,height-(2*R+DROP-wt)))
  const topArm=a-R/2
  const lowerTop=Math.min(topArm,h2)
  const lower=rect(d2-INSET,yA-INSET,topArm-armH,lowerTop)
  const colY0=d2+GAP
  const upper=topArm>h2-0.01?rect(colY0,yA-INSET,h2-0.3,topArm):()=>false
  const arm=any(lower,upper)
  const wall=rect(d2-wt,d2,-h2,h2)
  const floor=rect(-d2,d2,-h2,-h2+wt)
  const front=rect(-d2,-d2+wt,-h2,h2)
  const boxBase=any(wall,floor,front)
  const boxAtBoxX=any(boxBase,arm,disc(yA,a,R))
  const slab=rect(-d2,d2,h2,h2+wt)
  const yLim=ins>0?hingeRimBackLimit({...DEFAULTS,includeLid:true,includeHinge:true,depth,height,wallThickness:wt,hingeDiameter:D,hingeInsertDepth:ins,lidTolerance:tol}):0
  const frontRim=ins>0?rect(-d2+wt+tol,-d2+wt+tol+wt,h2-ins,h2):()=>false
  const sideRim=ins>0?rect(-d2+wt+tol,yLim,h2-ins,h2):()=>false
  const rim=frontRim
  const plateT = Math.min(wt,R+DROP-0.37)
  const plate=rect(d2-INSET,yA+R,h2+wt-plateT,h2+wt)
  const lidAtLidX=any(slab,rim,plate,disc(yA,a,R))
  const lidAtBoxX=any(slab,rim)
  const res:string[]=[]
  const lidSide=any(slab,sideRim)
  for(const [name,lid,box] of [['lid-knuckle x',lidAtLidX,boxBase],['box-knuckle x',lidAtBoxX,boxAtBoxX],['side rim x',lidSide,boxBase]] as const){
    let worst=0,worstAng=-1
    for(let deg=2;deg<=110;deg+=2){
      const th=deg*Math.PI/180
      let hit=0
      for(let y=-d2-1;y<yA+R+1;y+=0.15)for(let z=h2-ins-1;z<h2+wt+1;z+=0.15){
        if(!lid(y,z))continue
        // rotate about (yA,a) so the front (y<yA) goes UP
        const dy=y-yA,dz=z-a
        const y2=yA+dy*Math.cos(th)+dz*Math.sin(th)
        const z2=a-dy*Math.sin(th)+dz*Math.cos(th)
        if(box(y2,z2))hit++
      }
      if(hit>=1&&hit>worst){worst=hit;worstAng=deg}
    }
    res.push(`${name}: ${worst?`COLLIDES (up to ${worst} samples @ ${worstAng}°)`:'clear to 110°'}`)
  }
  return res.join(' | ')
}
const bad:string[]=[]
for(const D of [6,8,14]) for(const wt of [1,2,3,5,8,10]) for(const ins of [0,4,15]) {
  const eff=hingeInsertDepth({...DEFAULTS,includeLid:true,includeHinge:true,depth:60,height:40,wallThickness:wt,hingeDiameter:D,hingeInsertDepth:ins,lidTolerance:0.3});
  const r=run({depth:60,height:40,wt,D,ins,tol:0.3})
  if(r.includes('COLLIDES')) bad.push(`D=${D} wt=${wt} ins=${ins}(eff ${eff}): ${r}`)
}
if (process.env.VERBOSE) for (const tol of [0.15,0.3,0.6]) console.log('tol',tol,'max insert D8 wt2:',hingeInsertDepth({...DEFAULTS,includeLid:true,includeHinge:true,hingeInsertDepth:15,lidTolerance:tol}), ' wt10:',hingeInsertDepth({...DEFAULTS,wallThickness:10,includeLid:true,includeHinge:true,hingeInsertDepth:15,lidTolerance:tol}))
console.log(bad.length?bad.join('\n'):'hinge swing: all configurations clear')
if (bad.length) process.exit(1)
