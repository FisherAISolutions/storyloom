import jsPDF from 'jspdf';
import { download, STORAGE_BUCKETS } from '@/services/storage';
import { BINDING_PROFILES, PRINT_PROFILES, effectiveDpi } from '@/lib/printRules';
export { BINDING_PROFILES, PRINT_PROFILES, calculatePrintPrice, canTransitionPrintOrder, effectiveDpi } from '@/lib/printRules';

function blobToImage(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob);const image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve({image,width:image.naturalWidth,height:image.naturalHeight});};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image could not be decoded.'));};image.src=url;});}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}

export async function validatePrintBook(story,pages,{profileId='square-8-5',binding='hardcover',wrapCoverPath=null,providerTemplateId=null}={}){
  const profile=PRINT_PROFILES[profileId];const bindingProfile=BINDING_PROFILES[binding];if(!profile||!bindingProfile)throw new Error('Unsupported print specification.');
  const ordered=[...pages].sort((a,b)=>a.page_number-b.page_number);const issues=[];const images=[];
  if(!ordered.length)issues.push({severity:'error',code:'NO_PAGES',message:'The book has no interior pages.'});
  if(ordered.length<bindingProfile.planningMinimumPages)issues.push({severity:'error',code:'PAGE_COUNT_LOW',message:`This planning profile requires at least ${bindingProfile.planningMinimumPages} interior pages; the selected provider must confirm its exact minimum.`});
  if(ordered.length%2!==0)issues.push({severity:'error',code:'PAGE_COUNT_ODD',message:'The interior page count must be even for print imposition.'});
  for(const page of ordered){
    if(!page.image_path){issues.push({severity:'error',code:'IMAGE_MISSING',pageNumber:page.page_number,message:`Page ${page.page_number} has no illustration.`});continue;}
    try{const blob=await download(STORAGE_BUCKETS.STORY_IMAGES,page.image_path);const decoded=await blobToImage(blob);const dpi=effectiveDpi(decoded.width,decoded.height,profile);images.push({pageNumber:page.page_number,path:page.image_path,widthPx:decoded.width,heightPx:decoded.height,dpi});if(dpi<profile.targetDpi)issues.push({severity:dpi<200?'error':'warning',code:'DPI_LOW',pageNumber:page.page_number,message:`Page ${page.page_number} is approximately ${Math.floor(dpi)} DPI at this trim size; target is ${profile.targetDpi} DPI.`});}catch{issues.push({severity:'error',code:'IMAGE_UNAVAILABLE',pageNumber:page.page_number,message:`Page ${page.page_number} illustration could not be securely loaded.`});}
  }
  if(!wrapCoverPath)issues.push({severity:'error',code:'WRAP_COVER_MISSING',message:'A provider-template-based back/spine/front wrap cover is still required.'});
  if(!providerTemplateId)issues.push({severity:'error',code:'PROVIDER_TEMPLATE_REQUIRED',message:'Select an exact provider product and generated cover template before calling files print-ready.'});
  return {profile,binding:bindingProfile,pageCount:ordered.length,images,issues,interiorReady:!issues.some((issue)=>issue.severity==='error'&&issue.code!=='WRAP_COVER_MISSING'&&issue.code!=='PROVIDER_TEMPLATE_REQUIRED'),printReady:issues.every((issue)=>issue.severity!=='error'),label:'PREPRESS PROOF — NOT PROVIDER-READY'};
}

function addCoverImage(pdf,dataUrl,type,widthPx,heightPx,pageW,pageH){const ratio=Math.max(pageW/widthPx,pageH/heightPx);const width=widthPx*ratio;const height=heightPx*ratio;pdf.addImage(dataUrl,type,(pageW-width)/2,(pageH-height)/2,width,height,undefined,'FAST');}

export async function downloadPrintProofPdf(story,pages,{profileId='square-8-5',binding='hardcover'}={}){
  const validation=await validatePrintBook(story,pages,{profileId,binding});const {profile}=validation;const pageW=(profile.trimWidthIn+profile.bleedIn*2)*72;const pageH=(profile.trimHeightIn+profile.bleedIn*2)*72;const safe=(profile.safeMarginIn+profile.bleedIn)*72;
  const pdf=new jsPDF({unit:'pt',format:[pageW,pageH],orientation:pageW>pageH?'landscape':'portrait',compress:true});const ordered=[...pages].sort((a,b)=>a.page_number-b.page_number);
  for(let index=0;index<ordered.length;index+=1){if(index)pdf.addPage([pageW,pageH],pageW>pageH?'landscape':'portrait');const page=ordered[index];if(page.image_path){try{const blob=await download(STORAGE_BUCKETS.STORY_IMAGES,page.image_path);const [{width,height},dataUrl]=await Promise.all([blobToImage(blob),blobToDataUrl(blob)]);addCoverImage(pdf,dataUrl,blob.type.includes('png')?'PNG':'JPEG',width,height,pageW,pageH);}catch{}}
    const text=pdf.splitTextToSize(page.text||'',pageW-safe*2);const boxHeight=Math.max(70,text.length*16+28);pdf.setFillColor(255,255,255);pdf.setGState(new pdf.GState({opacity:.88}));pdf.roundedRect(safe,pageH-safe-boxHeight,pageW-safe*2,boxHeight,8,8,'F');pdf.setGState(new pdf.GState({opacity:1}));pdf.setTextColor(25,38,52);pdf.setFont('helvetica','bold');pdf.setFontSize(12);pdf.text(text,pageW/2,pageH-safe-boxHeight+24,{align:'center',maxWidth:pageW-safe*2-24});pdf.setFontSize(8);pdf.setTextColor(90);pdf.text(String(page.page_number),pageW-safe,pageH-safe+10,{align:'right'});
  }
  pdf.setProperties({title:`${story.title} — prepress proof`,subject:validation.label,creator:'MyStorybook AI'});pdf.save(`${(story.title||'story').replace(/[^\w- ]+/g,'').trim()||'story'}-PRINT-PROOF-NOT-PROVIDER-READY.pdf`);return validation;
}
