// Local-only substitutes. They never load vendor code or send data outside this origin.
const prefix = "/helix-verification/privacy/mock/event";
const start = `(()=>{window.__helixMockCalls=window.__helixMockCalls||[];const send=(service,data)=>fetch('${prefix}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service,data})});`;
export const privacyVerificationScripts: Record<string, string> = {
  "ga.js": `${start}
    const q=window.dataLayer||[];const push=q.push.bind(q);
    q.push=(...items)=>{for(const a of items){window.__helixMockCalls.push(['ga',...a]);if(a[0]==='config')document.cookie='_ga=synthetic; Path=/';if(a[0]==='event')send('ga',a);}return push(...items)};
  })();`,
  "meta.js": `${start}
    window.fbq.callMethod=(...a)=>{window.__helixMockCalls.push(['meta',...a]);if(a[0]==='init')document.cookie='_fbp=synthetic; Path=/';if(a[0]==='trackSingle')send('meta',a);};
    // Model the SDK's synchronous history observation, independently of React.
    for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...a){const result=original.apply(this,a);if(!window.fbq.disablePushState)send('meta-history',{url:location.href});return result;};}
  })();`,
  "web.js": `${start}
    let before=e=>e;window.va=(name,data)=>{if(name==='beforeSend')before=data;if(name==='pageview'){const e=before({type:'pageview',url:new URL(data.path||location.pathname,location.origin).href});if(e)send('web',e);}};
    for(const a of window.vaq||[])window.va(...a);window.vaq=[];
  })();`,
  "speed.js": `${start}
    let before=e=>e;window.si=(name,callback)=>{if(name==='beforeSend')before=callback;};for(const a of window.siq||[])window.si(...a);window.siq=[];
    window.addEventListener('helix-privacy-verification-metric',()=>{const e=before({type:'vital',url:location.href});if(e)send('speed',e);});
  })();`,
};
