import jsPDF from 'jspdf';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function getImage(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl = await blobToDataUrl(blob);
  const img = await loadImageFromDataUrl(dataUrl);
  return { dataUrl, w: img.naturalWidth, h: img.naturalHeight, isPng: blob.type.includes('png') };
}

function fitContain(w, h, maxW, maxH) {
  const r = Math.min(maxW / w, maxH / h);
  return { w: w * r, h: h * r };
}

function placeCenter(x, y, w, h, maxW, maxH) {
  return { x: x + (maxW - w) / 2, y: y + (maxH - h) / 2 };
}

export async function downloadStoryPdf(story, pages) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const usableW = pageW - margin * 2;

  // Cover
  const coverUrl = story.cover_image_url || pages[0]?.image_url;
  const imgMaxH = pageH - margin * 2 - 60;
  if (coverUrl) {
    try {
      const { dataUrl, w, h, isPng } = await getImage(coverUrl);
      const box = fitContain(w, h, usableW, imgMaxH);
      const pos = placeCenter(margin, margin, box.w, box.h, usableW, imgMaxH);
      pdf.addImage(dataUrl, isPng ? 'PNG' : 'JPEG', pos.x, pos.y, box.w, box.h, undefined, 'FAST');
    } catch {}
  }

  // Cover title below image
  let titleY = margin + imgMaxH + 24;
  pdf.setTextColor(30, 30, 30);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.text(story.title || 'My Story', pageW / 2, titleY, { align: 'center' });

  if (story.summary) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(90, 90, 90);
    const sumLines = pdf.splitTextToSize(story.summary, usableW - 80);
    pdf.text(sumLines, pageW / 2, titleY + 22, { align: 'center' });
  }
  pdf.setTextColor(0);

  // Story pages — image on top, text below
  pages.sort((a, b) => a.page_number - b.page_number);
  const pageImgMaxH = pageH - margin * 2 - 90;
  for (let i = 0; i < pages.length; i++) {
    pdf.addPage();
    const p = pages[i];

    if (p.image_url) {
      try {
        const { dataUrl, w, h, isPng } = await getImage(p.image_url);
        const box = fitContain(w, h, usableW, pageImgMaxH);
        const pos = placeCenter(margin, margin, box.w, box.h, usableW, pageImgMaxH);
        pdf.addImage(dataUrl, isPng ? 'PNG' : 'JPEG', pos.x, pos.y, box.w, box.h, undefined, 'FAST');
      } catch {}
    }

    // Text below image
    pdf.setTextColor(35, 35, 35);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(13);
    const textLines = pdf.splitTextToSize(p.text || '', usableW - 60);
    let textY = margin + pageImgMaxH + 30;
    textLines.forEach((line) => {
      pdf.text(line, pageW / 2, textY, { align: 'center' });
      textY += 18;
    });

    // Page number
    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    pdf.text(String(i + 1), pageW - margin - 4, pageH - margin + 2, { align: 'right' });
    pdf.setTextColor(0);
  }

  pdf.save(`${(story.title || 'story').replace(/[^\w- ]+/g, '').trim() || 'story'}.pdf`);
}