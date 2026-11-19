const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const safeUrl = (value) => typeof value === 'string' && /^(https?:|blob:)/.test(value) ? value : null;

export function splitNarrationSentences(text) {
  return String(text || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part)=>part.trim()).filter(Boolean) || [];
}

export function getPageNarration(page = {}) {
  const source=page.narration && typeof page.narration==='object' ? page.narration : {};
  const timings=Array.isArray(source.timings||page.narration_timings) ? (source.timings||page.narration_timings).filter((item)=>item&&finitePositive(item.end_ms)&&Number(item.start_ms)>=0).map((item,index)=>({sentence_index:Number.isInteger(item.sentence_index)?item.sentence_index:index,start_ms:Number(item.start_ms),end_ms:Number(item.end_ms)})) : [];
  return {
    audioUrl:safeUrl(source.audio_url||page.narration_audio_url),
    durationMs:finitePositive(source.duration_ms||page.narration_duration_ms),
    timings,
    voiceId:typeof (source.voice_id||page.narrator_voice_id)==='string' ? (source.voice_id||page.narrator_voice_id) : null,
  };
}

export function getPageAnimation(page = {}) {
  const source=page.animation && typeof page.animation==='object' ? page.animation : {};
  return {
    videoUrl:safeUrl(source.video_url||page.animation_url),
    posterUrl:safeUrl(source.poster_url||page.animation_poster_url||page.image_url),
    durationMs:finitePositive(source.duration_ms||page.animation_duration_ms),
  };
}

// Future generation and pricing remain server-authoritative. The reader only
// consumes media already attached to an authorized page payload.
export const OPTIONAL_MEDIA_OPERATIONS=Object.freeze({ narration:'generate-page-narration', animation:'generate-page-animation' });
