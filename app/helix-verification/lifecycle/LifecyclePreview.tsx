export function LifecyclePreview({previews}:{previews:{purpose:string;subject:string;html:string;text:string}[]}){
 return <section style={{padding:'24px',maxWidth:1000,margin:'auto'}}>
  <h1>Lifecycle email previews</h1>
  <p role="note">Simulation only. No emails are sent, no subscriptions are saved, and no real discount is created. All email links are non-operative.</p>
  {previews.map(preview=><section key={preview.purpose} style={{marginTop:32}}>
   {preview.purpose==='lifecycle_welcome'&&<p><a href="/helix-verification/lifecycle/welcome">Open welcome email preview</a></p>}
   <h2>{preview.purpose.replace('lifecycle_','').replaceAll('_',' ')}</h2><p>Subject: {preview.subject}</p>
   <iframe title={`${preview.purpose} email`} srcDoc={preview.html} sandbox="" style={{width:'100%',height:preview.purpose==='lifecycle_welcome'?5400:preview.purpose==='lifecycle_browse'?3400:2400,border:0,background:'#fff'}}/>
   <details><summary>Plain text</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{preview.text}</pre></details>
   <a download={`${preview.purpose}-synthetic-preview.html`} href={`data:text/html;charset=utf-8,${encodeURIComponent(preview.html)}`}>Download synthetic HTML</a>
  </section>)}
  <p>White-only browser preview. Marcellus uses a Georgia fallback in email clients that do not support web fonts. Downloaded previews require these local image and font assets and are not self-contained. Email clients may transform or strip styles; Gmail, Outlook and Apple Mail rendering has not been tested. Draft HTML changes require separately reviewed native-template publication and new approval fingerprints before activation.</p>
 </section>;
}
