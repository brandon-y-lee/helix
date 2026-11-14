'use client';
import {useState} from 'react';
import {WelcomePopupVisit,type WelcomePopupTransport} from '@/components/marketing/WelcomePopup';
function memoryTransport():WelcomePopupTransport {
 let dismissed=false;
 return {readiness:async()=>({ready:true,scope:'lifecycle_reviews'}),subscribe:async()=>({ok:true}),isDismissed:()=>dismissed,rememberDismissal:()=>{dismissed=true;}};
}
export function LifecyclePreview({previews}:{previews:{purpose:string;subject:string;html:string;text:string}[]}){
 const [popup,setPopup]=useState<{key:number;transport:WelcomePopupTransport}|null>(null);
 return <section style={{padding:'24px',maxWidth:1000,margin:'auto'}}>
  <h1>Lifecycle email and welcome popup preview</h1>
  <p role="note">Simulation only. No emails are sent, no subscriptions are saved, and no real discount is created. All email links are non-operative. Popup entries stay in browser memory only and are discarded on reset or navigation. Confirmation wording below is simulated, not a real inbox instruction.</p>
  <button type="button" className="btn" onClick={()=>setPopup({key:Date.now(),transport:memoryTransport()})}>Start / reset popup preview</button>
  <p>The real popup appears after its normal 12-second delay. Close or Escape dismisses it; reset starts a fresh simulation.</p>
  {popup&&<WelcomePopupVisit key={popup.key} transport={popup.transport}/>}
  {previews.map(preview=><section key={preview.purpose} style={{marginTop:32}}>
   <h2>{preview.purpose.replace('lifecycle_','').replaceAll('_',' ')}</h2><p>Subject: {preview.subject}</p>
   <iframe title={`${preview.purpose} email`} srcDoc={preview.html} sandbox="" style={{width:'100%',height:850,border:0,background:'#fff'}}/>
   <details><summary>Plain text</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</pre></details>
   <a download={`${preview.purpose}-synthetic-preview.html`} href={`data:text/html;charset=utf-8,${encodeURIComponent(preview.html)}`}>Download synthetic HTML</a>
  </section>)}
  <p>White-only browser preview. Email clients may transform or strip styles; Gmail, Outlook and Apple Mail rendering has not been tested. Draft HTML changes require separately reviewed native-template publication and new approval fingerprints before activation.</p>
 </section>;
}
