import "server-only";
import { createHash } from "node:crypto";
import type { ProductionMarketingDeliveryContract } from "./delivery-config";
import type { ProductionMarketingIntent } from "./delivery-types";
const sources={
  confirmation:{subject:"Confirm your Helix welcome emails",heading:"Confirm your subscription",copy:"Confirm that you want to receive Helix welcome emails. This does not include behavior-based marketing or review requests.",action:"Confirm subscription"},
  welcome:{subject:"Welcome to Helix",heading:"Welcome to Helix",copy:"Thanks for joining us. Explore Helix and find a place for skincare in your daily routine.",action:"Explore Helix"},
  ignore:"If you did not request this, ignore this email. Opening this email or its link does not confirm your subscription. Choose Confirm subscription on the page to finish.",
  footer:"You can unsubscribe at any time. This does not change account or support emails.",
} as const;
const htmlTemplate='<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{subject}}</title></head><body style="margin:0;background:#fff;color:#353631;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="padding-bottom:32px"><img src="https://www.helixskin.us/brand/helix-wordmark-email.png" alt="Helix" width="240" height="99" style="display:block;max-width:100%;height:auto"></td></tr><tr><td><h1 style="font-family:Georgia,serif;font-size:36px;line-height:1.2;font-weight:400">{{heading}}</h1><p style="font-size:17px;line-height:1.6">{{copy}}</p><p style="font-size:15px;line-height:1.6">{{instructions}}</p><p style="margin:32px 0"><a href="{{actionUrl}}" style="display:inline-block;padding:16px 24px;border:1px solid #73746d;border-radius:32px;color:#353631;text-decoration:none">{{action}}</a></p><p style="font-size:13px;line-height:1.6">{{footer}}</p><p><a href="{{preferences}}" style="color:#353631">Email preferences and unsubscribe</a></p><p style="font-size:12px;line-height:1.6">Helix<br>{{postalAddress}}</p></td></tr></table></td></tr></table></body></html>';
const textTemplate="Helix\n{{heading}}\n\n{{copy}}\n\n{{instructions}}\n{{action}}: {{actionUrl}}\n\n{{footer}}\nEmail preferences and unsubscribe: {{preferences}}\n\nHelix\n{{postalAddress}}";
export const productionMarketingTemplateHash=createHash("sha256").update(JSON.stringify({htmlTemplate,textTemplate,sources})).digest("hex");
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function renderProductionMarketingMessage(intent:ProductionMarketingIntent,contract:ProductionMarketingDeliveryContract,tokens:{confirmationToken?:string;preferenceToken:string}) {
  const origin="https://www.helixskin.us", source=sources[intent.purpose];
  const preferences=`${origin}/marketing/production/preferences#token=${tokens.preferenceToken}`;
  const action=intent.purpose==="confirmation"?`${origin}/marketing/production/confirm#token=${tokens.confirmationToken}`:origin;
  const instructions=intent.purpose==="confirmation"?sources.ignore:"";
  const values:Record<string,string>={...source,instructions,actionUrl:action,footer:sources.footer,preferences,postalAddress:contract.postalAddress};
  const substitute=(template:string,html:boolean)=>template.replace(/\{\{([A-Za-z]+)\}\}/g,(_match,key:string)=>{if(!Object.hasOwn(values,key))throw new Error("Production marketing is unavailable.");return html?escape(values[key]):values[key];});
  const html=substitute(htmlTemplate,true);
  return {from:contract.from,to:[intent.email],reply_to:contract.replyTo,subject:source.subject,html,
    text:substitute(textTemplate,false),
    headers:intent.purpose==="welcome"?{"List-Unsubscribe":`<${origin}/api/marketing/production/unsubscribe?token=${tokens.preferenceToken}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}:{},
    tags:[{name:"environment",value:"production"},{name:"helix_message_id",value:intent.id},{name:"helix_purpose",value:intent.purpose},{name:"helix_contract",value:contract.version}]};
}
