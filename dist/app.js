import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';

const $=id=>document.getElementById(id);
const ASSETS=['01-2026_9_7.glb','02-2026_9_7.glb','03-2026_9_7-3-.glb','04-2026_9_7-2-.glb','05-2026_9_7-1-.glb'];
const stages=[
 {name:'FAMILIAR',desc:'Background information stays in the background.',fog:0x9da3a1,light:1.6},
 {name:'SLIGHTLY WRONG',desc:'Small repetitions begin to ask for attention.',fog:0x777f7d,light:1.35},
 {name:'UNSTABLE',desc:'Scale, rhythm, and perspective stop feeling dependable.',fog:0x5e5550,light:1.05},
 {name:'OVERWHELMING',desc:'Sound, light, text, and movement compete at once.',fog:0x421a16,light:.72},
 {name:'UNRECOGNIZABLE',desc:'Foreground and background can no longer be separated.',fog:0x180807,light:.42}
];
let renderer,scene,camera,clock,started=false,ended=false,locked=false,currentStage=0,audio;
const keys=new Set(),models=[],papers=[],lights=[];
const corridorLength=96, startZ=9, endZ=-86;

function fail(message){$('loading').hidden=true;$('intro').hidden=true;$('fallback').hidden=false;$('fallback').querySelector('p').textContent=message||$('fallback').querySelector('p').textContent;}

async function init(){
 try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){fail();return;}
 renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;$('scene').appendChild(renderer.domElement);renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());
 scene=new THREE.Scene();scene.background=new THREE.Color(0xaeb4b1);scene.fog=new THREE.FogExp2(0x9da3a1,.022);
 camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.08,190);camera.position.set(0,1.65,startZ);camera.rotation.order='YXZ';clock=new THREE.Clock();
 const hemi=new THREE.HemisphereLight(0xf2f5ef,0x232323,1.6);hemi.name='hemi';scene.add(hemi);
 const hallLight=new THREE.DirectionalLight(0xffffff,2.5);hallLight.position.set(1,7,6);scene.add(hallLight);
 createCorridor();createArtifacts();
 $('loading').hidden=false;
 const loader=new GLTFLoader();
 for(let i=0;i<ASSETS.length;i++){
  try{const gltf=await loader.loadAsync('./assets/'+ASSETS[i]);prepareScan(gltf.scene,i);}catch(e){console.warn('Scan failed',ASSETS[i],e);}
  $('loadBar').style.width=((i+1)/ASSETS.length*100)+'%';$('loadLabel').textContent=`Loading scan ${i+1} of ${ASSETS.length}…`;
 }
 if(!models.length){fail('The Polycam files could not be loaded. Please serve this folder through VS Code Live Server.');return;}
 $('loading').hidden=true;$('intro').hidden=false;animate();
 }

function createCorridor(){
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(12,120),new THREE.MeshStandardMaterial({color:0x9b9c97,roughness:.72,metalness:.02}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-.02,-42);scene.add(floor);
 const wallMat=new THREE.MeshStandardMaterial({color:0xd6d3c9,roughness:.88,side:THREE.DoubleSide});
 for(const x of [-6,6]){const w=new THREE.Mesh(new THREE.PlaneGeometry(120,5),wallMat);w.rotation.y=Math.PI/2;w.position.set(x,2.5,-42);scene.add(w);}
 const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(12,120),new THREE.MeshStandardMaterial({color:0xc8c7bf,roughness:.9,side:THREE.DoubleSide}));ceiling.rotation.x=Math.PI/2;ceiling.position.set(0,5,-42);scene.add(ceiling);
 for(let z=5;z>-94;z-=8){const panel=new THREE.Mesh(new THREE.BoxGeometry(3.8,.06,.7),new THREE.MeshBasicMaterial({color:0xf5fff8}));panel.position.set(0,4.9,z);scene.add(panel);lights.push(panel);const pl=new THREE.PointLight(0xe9fff4,2.1,13,1.4);pl.position.set(0,4.65,z);scene.add(pl);lights.push(pl);}
}

function prepareScan(root,i){
 root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;if(o.material){o.material=o.material.clone();o.material.roughness=Math.max(.65,o.material.roughness??.8);}}});
 const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const scale=Math.min(1.35,15/Math.max(size.x,size.z,size.y*1.4));root.scale.setScalar(scale);root.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale-i*20);
 if(i>1){root.rotation.y=(i-2)*.035;root.scale.x*=1+(i-1)*.08;}
 root.userData.baseZ=root.position.z;scene.add(root);models.push(root);
}

function createArtifacts(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#ece8d8';c.fillRect(0,0,512,256);c.fillStyle='#17202a';c.font='700 46px Arial';c.fillText('STUDENT EVENTS',30,65);c.fillStyle='#ef432c';c.fillRect(30,92,160,14);c.fillStyle='#34383b';c.font='26px Arial';c.fillText('JOIN  •  LEARN  •  BELONG',30,145);c.fillText('ROOM 105  /  4:30 PM',30,190);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 for(let n=0;n<34;n++){const p=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.85),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide,transparent:true}));const stage=Math.floor(n/7);p.position.set((n%2?1:-1)*(5.88-(n%3)*.02),1.2+(n%4)*.82,-8-stage*18-(n%7)*1.3);p.rotation.y=n%2?-Math.PI/2:Math.PI/2;p.userData={base:p.position.clone(),seed:n*.73,stage};scene.add(p);papers.push(p);}
}

function start(){started=true;$('intro').classList.add('fade');setTimeout(()=>$('intro').hidden=true,700);$('hud').hidden=false;renderer.domElement.requestPointerLock?.();ensureAudio();}
function reset(){ended=false;currentStage=0;camera.position.set(0,1.65,startZ);camera.rotation.set(0,0,0);$('ending').hidden=true;$('hud').hidden=false;updateStage(0,true);}

function ensureAudio(){
 if(audio)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC(),master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
 const hum=ctx.createOscillator(),humGain=ctx.createGain();hum.type='sawtooth';hum.frequency.value=59.8;humGain.gain.value=.055;hum.connect(humGain).connect(master);hum.start();
 const len=ctx.sampleRate*2,buffer=ctx.createBuffer(1,len,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*.23;const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter();noise.buffer=buffer;noise.loop=true;filter.type='bandpass';filter.frequency.value=850;filter.Q.value=.7;noise.connect(filter).connect(master);noise.start();
 audio={ctx,master,hum,filter,on:false};
}
function toggleSound(){ensureAudio();if(!audio)return;audio.on=!audio.on;audio.ctx.resume();audio.master.gain.setTargetAtTime(audio.on?.13:0,audio.ctx.currentTime,.18);$('soundBtn').textContent=audio.on?'SOUND ON':'SOUND OFF';$('soundBtn').setAttribute('aria-pressed',String(audio.on));}

function updateStage(n,force=false){if(n===currentStage&&!force)return;currentStage=n;const s=stages[n];$('stageIndex').textContent=String(n+1).padStart(2,'0')+' / 05';$('stageName').textContent=s.name;$('stageDesc').textContent=s.desc;}

function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04),time=clock.elapsedTime;
 if(started&&!ended){const yaw=camera.rotation.y,forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));let velocity=0;if(keys.has('KeyW')||keys.has('ArrowUp'))velocity+=1;if(keys.has('KeyS')||keys.has('ArrowDown'))velocity-=1;const speed=3.3+currentStage*.35;camera.position.addScaledVector(forward,velocity*speed*dt);if(keys.has('KeyA'))camera.position.addScaledVector(right,-speed*dt);if(keys.has('KeyD'))camera.position.addScaledVector(right,speed*dt);camera.position.x=THREE.MathUtils.clamp(camera.position.x,-5.2,5.2);camera.position.y=1.65;
  const progress=THREE.MathUtils.clamp((startZ-camera.position.z)/corridorLength,0,1),n=Math.min(4,Math.floor(progress*5));updateStage(n);$('intensityBar').style.width=(progress*100)+'%';const s=stages[n],blend=(progress*5)%1;scene.fog.color.lerp(new THREE.Color(s.fog),.06);scene.background.copy(scene.fog.color);scene.fog.density=.018+progress*.06;renderer.toneMappingExposure=1.08-progress*.26;
  const instability=Math.max(0,(progress-.34)/.66);camera.rotation.z=Math.sin(time*(2+progress*7))*instability*.018;camera.position.y=1.65+Math.sin(time*7.3)*instability*.018;
  lights.forEach((l,i)=>{if(l.isLight)l.intensity=(1.9-progress*.8)*(progress>.22&&Math.sin(time*(7+i%4)+i)<-.76?.12:1);else l.material.color.setHex(progress>.55&&i%5===0?0xff3c24:0xf5fff8);});
  papers.forEach((p,i)=>{const active=Math.max(0,progress-p.userData.stage*.12-.18);p.position.copy(p.userData.base);p.position.y+=Math.sin(time*(.5+i%4*.16)+p.userData.seed)*active*(.3+i%3*.15);p.position.x+=Math.sin(time*.7+p.userData.seed)*active*.45;p.rotation.z=Math.sin(time*(.4+i%5*.11)+i)*active*.35;p.material.opacity=.75+Math.sin(time*8+i)*progress*.2;});
  models.forEach((m,i)=>{const local=Math.max(0,progress-i*.13);m.rotation.z=Math.sin(time*.45+i)*local*.025;m.scale.y*=1+Math.sin(time*.7+i)*local*.00035;});
  if(audio?.on){audio.master.gain.setTargetAtTime(.07+progress*.17,audio.ctx.currentTime,.18);audio.hum.frequency.setTargetAtTime(59.8+progress*2.8,audio.ctx.currentTime,.3);audio.filter.frequency.setTargetAtTime(700+progress*2200,audio.ctx.currentTime,.3);}
  if(progress>.985){ended=true;document.exitPointerLock?.();$('hud').hidden=true;$('ending').hidden=false;}
 }
 renderer.render(scene,camera);
}

$('startBtn').onclick=start;$('restartBtn').onclick=()=>{reset();renderer.domElement.requestPointerLock?.();};$('soundBtn').onclick=toggleSound;
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer?.domElement;if($('hint'))$('hint').textContent=locked?'W A S D TO MOVE · R TO RESET':'CLICK THE SCENE TO LOOK · W A S D TO MOVE';});
document.addEventListener('mousemove',e=>{if(!locked||!started||ended)return;camera.rotation.y-=e.movementX*.0022;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*.0018,-1.15,1.15);});
document.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(e.code==='KeyR')reset();});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
window.addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.addEventListener('error',e=>{console.error(e.error||e.message);if(!renderer)fail();});
init();
