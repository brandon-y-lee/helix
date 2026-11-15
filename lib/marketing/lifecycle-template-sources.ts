/** Native draft sources only. Publication and immutable fingerprint approval are separate.
 * Existing approved receipt generations always retain their original native version. */
const origin='{{{HELIX_SITE_ORIGIN}}}';
const white='background-color:#ffffff';
const row=(body:string,style='')=>`<tr><td align="center" bgcolor="#ffffff" style="${white};${style}">${body}</td></tr>`;
const heading=(text:string,level=2,size=48)=>`<h${level} style="font-family:Marcellus,Georgia,serif;font-size:${size}px;line-height:1.15;font-weight:400;margin:0 0 20px">${text}</h${level}>`;
const paragraph=(text:string,style='')=>`<p style="font-size:21px;line-height:1.4;margin:0 0 16px;${style}">${text}</p>`;
const eyebrow=(text:string)=>paragraph(text,'font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase');
const copy=(body:string)=>row(body,'padding:36px 28px');
const photo=(file:string,alt:string,height:number)=>row(`<img src="${origin}/media/email/${file}" alt="${alt}" width="600" height="${height}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:12px">`);
const button=(label:string,url:string)=>`<table role="presentation" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="${white};margin:26px auto"><tr><td align="center" bgcolor="#ffffff" style="${white};border:1px solid #73746d;border-radius:99px"><a href="{{{${url}}}}" style="display:inline-block;padding:18px 28px;color:#62635e;font-size:16px;line-height:1.4;text-align:center;text-decoration:none">${label}</a></td></tr></table>`;
const divider=row('','border-top:1px solid #b7b8b2');
const footer=row(`<p style="margin:0 0 18px">helix<br>Thoughtful skincare. Lasting intention.</p><p style="margin:0 0 12px"><a href="{{{HELIX_PREFERENCES_URL}}}" style="color:#62635e;text-decoration:underline">Email preferences and unsubscribe</a></p><p style="margin:0">{{{HELIX_POSTAL_ADDRESS}}}</p>`,'padding:32px 24px;font-size:12px;line-height:1.6');
const frame=(title:string,body:string)=>`<!doctype html><html lang="en" dir="ltr" style="${white}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>@font-face{font-family:Marcellus;font-style:normal;font-weight:400;font-display:swap;src:url("${origin}/fonts/marcellus-latin.woff2") format("woff2")}@media(max-width:600px){h1,h2{font-size:34px!important}p{font-size:16px!important}.email-footer p{font-size:12px!important} }</style></head><body bgcolor="#ffffff" style="margin:0;${white};color:#62635e;font-family:Arial,sans-serif;overflow-wrap:break-word"><table lang="en" dir="ltr" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="${white}"><tr><td align="center" bgcolor="#ffffff" style="${white};padding:20px 22px 32px"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="${white};max-width:600px">${row(`<img src="${origin}/brand/helix-wordmark-email.png" alt="helix" width="600" height="248" style="display:block;width:100%;max-width:600px;height:auto;border:0">`,'padding-bottom:24px')}${body}${footer}</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
const deadline=paragraph('Use your offer by {{{HELIX_OFFER_EXPIRES_LABEL}}}','font-size:13px');
const terms=paragraph('{{{HELIX_OFFER_TERMS}}}','font-size:12px');
const textFooter='\n\nhelix\nThoughtful skincare. Lasting intention.\nEmail preferences and unsubscribe: {{{HELIX_PREFERENCES_URL}}}\n{{{HELIX_POSTAL_ADDRESS}}}';
const textOffer='\nUse your offer by {{{HELIX_OFFER_EXPIRES_LABEL}}}\n{{{HELIX_OFFER_TERMS}}}';

export const lifecycleTemplateSources={
 lifecycle_welcome:{
  subject:'Welcome to helix: your first-purchase offer',
  html:frame('Welcome to helix',
   photo('welcome-profile.jpg','Side profile of a model with natural skin texture',800)+
   copy(eyebrow('Welcome to the world of helix')+heading('Start with your skin.',1)+paragraph('Thoughtful skincare for the skin you have now. Daily essentials to restore, protect, and nurture — with lasting results that reveal themselves over time.'))+
   photo('welcome-macro.jpg','A serum drop suspended from a glass dropper',800)+
   copy(heading('One step for longevity.',2,36)+paragraph('A lightweight serum. A considered daily ritual.'))+
   photo('welcome-portrait.jpg','A model holding Helix Super Serum beside his cheek',800)+
   copy(eyebrow('A simpler approach to skincare')+heading('Restore.',2,36)+heading('Protect.',2,36)+heading('Nurture.',2,36)+button('MEET YOUR DAILY ESSENTIAL','HELIX_CART_URL'))+
   photo('serum-still-life.jpg','Helix Super Serum on a bathroom ledge beside a mirror',740)+
   copy(eyebrow('A welcome gift for your first step')+heading('Welcome to helix.',2,48)+paragraph('Enjoy {{{HELIX_OFFER_PERCENT}}}% off your first eligible purchase.')+button('START YOUR HELIX RITUAL','HELIX_CART_URL')+deadline+terms)),
  text:'helix\nStart with your skin.\nThoughtful skincare for the skin you have now. Daily essentials to restore, protect, and nurture — with lasting results that reveal themselves over time.\n\nOne step for longevity.\nA lightweight serum. A considered daily ritual.\nRestore. Protect. Nurture.\nMeet your daily essential: {{{HELIX_CART_URL}}}\n\nWelcome to helix.\nEnjoy {{{HELIX_OFFER_PERCENT}}}% off your first eligible purchase.\nStart your helix ritual: {{{HELIX_CART_URL}}}'+textOffer+textFooter,
 },
 lifecycle_cart:{
  subject:'Your helix routine is waiting',
  html:frame('Your helix routine is waiting',photo('cart-portrait.jpg','A model holding Helix Super Serum',800)+copy(eyebrow('Your daily essential')+heading('One step away.',1)+paragraph('You left something in your cart. Make it part of your daily ritual.'))+divider+copy(eyebrow('A little something to come back to')+heading('{{{HELIX_OFFER_PERCENT}}}% off',2,64)+paragraph('Your personal offer is ready.')+button('RETURN TO YOUR CART','HELIX_CART_URL')+deadline+terms)),
  text:'helix\nOne step away.\nYou left something in your cart. Make it part of your daily ritual.\n\n{{{HELIX_OFFER_PERCENT}}}% off your next eligible purchase.\nYour personal offer is ready.\nReturn to your cart: {{{HELIX_CART_URL}}}'+textOffer+textFooter,
 },
 lifecycle_browse:{
  subject:'Take another look at {{{HELIX_PRODUCT_NAME}}}',
  html:frame('Take another look',photo('browse-portrait.jpg','A model with eyes closed and lightly glossy skin',740)+copy(eyebrow('Take another look')+heading('Your next daily ritual.',1)+paragraph('{{{HELIX_PRODUCT_NAME}}} is available to shop.')+button('EXPLORE {{{HELIX_PRODUCT_NAME}}}','HELIX_PRODUCT_URL'))+photo('serum-still-life.jpg','Helix Super Serum in a bathroom still life',740)+copy(eyebrow('Thoughtful skincare')+heading('One step for longevity.',2,40)+paragraph('Find a simple place in your everyday routine.'))+divider+copy(heading('Cleanse. Treat. Moisturize.',2,34)+button('FIND YOUR DAILY ESSENTIAL','HELIX_PRODUCT_URL'))),
  text:'helix\nYour next daily ritual.\n{{{HELIX_PRODUCT_NAME}}} is available to shop.\nExplore {{{HELIX_PRODUCT_NAME}}}: {{{HELIX_PRODUCT_URL}}}\n\nOne step for longevity.\nFind a simple place in your everyday routine.\nCleanse. Treat. Moisturize.\nFind your daily essential: {{{HELIX_PRODUCT_URL}}}'+textFooter,
 },
 lifecycle_review_winback:{
  subject:'How is your helix routine?',
  html:frame('How is your helix routine?',photo('review-portrait.jpg','A model looking down at Helix Super Serum',600)+copy(eyebrow('Your routine. Your experience.')+heading('How is your routine working for you?',1)+paragraph('We would love your honest thoughts. What did you notice? How did it fit your routine?')+button('SHARE YOUR EXPERIENCE','HELIX_REVIEW_URL')+paragraph('All experiences are welcome. Your feedback helps others find their own routine.','font-size:17px'))+divider+copy(eyebrow('For your next chapter')+heading('{{{HELIX_OFFER_PERCENT}}}% off your next eligible purchase.',2,42)+paragraph('A little something for your next helix ritual. Yours whether or not you leave a review.')+button('EXPLORE HELIX','HELIX_SHOP_URL')+deadline+paragraph('No review or positive rating required. Account sign-in required to redeem.','font-size:12px')+terms)),
  text:'helix\nHow is your routine working for you?\nWe would love your honest thoughts. What did you notice? How did it fit your routine?\nShare your experience: {{{HELIX_REVIEW_URL}}}\nAll experiences are welcome. Your feedback helps others find their own routine.\n\n{{{HELIX_OFFER_PERCENT}}}% off your next eligible purchase.\nA little something for your next helix ritual. Yours whether or not you leave a review.\nNo review or positive rating required. Account sign-in required to redeem.\nExplore helix: {{{HELIX_SHOP_URL}}}'+textOffer+textFooter,
 },
};
