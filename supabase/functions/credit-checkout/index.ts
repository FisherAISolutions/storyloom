import { ANON_KEY, BillingError, SUPABASE_URL, appUrl, authenticate, cors, customerFor, response, safeFailure, service, stripe } from '../_shared/billing.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

const keyPattern=/^(starter|credits_small|credits_medium|credits_large)$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async(request)=>{let headers:HeadersInit={};let claimId:string|null=null;try{
 headers=cors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')throw new BillingError('VALIDATION','Only POST requests are supported.',405);
 const user=await authenticate(request);const body=await request.json().catch(()=>({}));
 if(!keyPattern.test(body?.product_key||'')||!uuidPattern.test(body?.request_id||'')||Object.keys(body).some((key)=>!['product_key','request_id'].includes(key)))throw new BillingError('VALIDATION','Choose an available credit product.',400);
 const authorization=request.headers.get('Authorization')||'';const client=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const claimed=await client.rpc('claim_credit_checkout',{p_product_key:body.product_key,p_request_id:body.request_id});if(claimed.error||!claimed.data)throw new BillingError(claimed.error?.message?.includes('SUBSCRIPTION_REQUIRED')?'SUBSCRIPTION_REQUIRED':'CHECKOUT_UNAVAILABLE','This credit purchase is not available for this account.',409);claimId=claimed.data;
 const product=await service.from('credit_products').select('product_key,stripe_price_id').eq('product_key',body.product_key).eq('active',true).maybeSingle();if(product.error||!product.data?.stripe_price_id)throw new BillingError('PRODUCT_UNAVAILABLE','This credit product is unavailable.',409);
 const customer=await customerFor(user);const origin=appUrl();const suffix=crypto.randomUUID().replaceAll('-','').slice(0,8);
 const session=await stripe('checkout/sessions',{mode:'payment',customer,'line_items[0][price]':product.data.stripe_price_id,'line_items[0][quantity]':'1',client_reference_id:user.id,'metadata[purchase_type]':'ai_credits','metadata[user_id]':user.id,'metadata[product_key]':product.data.product_key,'metadata[checkout_claim_id]':claimId,'integration_identifier':`mystorybook-credits-${suffix}`,success_url:`${origin}/billing/success`,cancel_url:`${origin}/billing?checkout=cancelled`},`credits:${user.id}:${body.request_id}`);
 await service.from('credit_checkout_requests').update({stripe_checkout_session_id:session.id,updated_at:new Date().toISOString()}).eq('id',claimId);
 return response({data:{url:session.url}},200,headers);
}catch(caught){if(claimId)await service.rpc('complete_credit_checkout_request',{p_id:claimId,p_session_id:'',p_success:false});const error=safeFailure(caught);return response({error:{code:error.code,message:error.message}},error.status,headers);}});
