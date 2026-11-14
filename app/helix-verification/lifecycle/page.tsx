import { notFound } from 'next/navigation';
import { renderLifecyclePreviews } from './render-preview';
import { LifecyclePreview } from './LifecyclePreview';
export const dynamic='force-dynamic';
export default async function LifecycleVerificationPage(){
 if(process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER!=='1') notFound();
 const previews=await renderLifecyclePreviews();
 return <LifecyclePreview previews={previews}/>;
}
