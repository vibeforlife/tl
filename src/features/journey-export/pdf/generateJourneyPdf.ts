import { GState, jsPDF } from 'jspdf';
import type { Entry, Journey } from '../../../types/domain';
import type { JourneyExportMode } from '../types';
import { loadPhotoAsJpeg } from './image';
import { WORLD_MAP_DATA } from './worldMapData';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 17;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 19;
const INK = '#29251f';
const MUTED = '#71685b';
const ACCENT = '#8b6745';

const dateLabel = (value: string) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const rangeLabel = (journey: Journey) =>
  `${dateLabel(journey.startDate)} – ${dateLabel(journey.endDate)}`;

const clean = (value?: string | null) => value?.trim() ?? '';

function drawCompass(doc: jsPDF, cx: number, cy: number, radius: number) {
  doc.setDrawColor(151, 117, 78);
  doc.setLineWidth(0.22);
  doc.circle(cx, cy, radius);
  doc.circle(cx, cy, radius * 0.72);
  doc.line(cx, cy - radius * 0.88, cx, cy + radius * 0.88);
  doc.line(cx - radius * 0.88, cy, cx + radius * 0.88, cy);
  doc.setFillColor(139, 103, 69);
  doc.triangle(cx, cy - radius * 0.78, cx - radius * 1.7, cy, cx + radius * 1.7, cy, 'F');
  doc.setFillColor(225, 211, 187);
  doc.triangle(cx, cy + radius * 0.78, cx - radius * 1.7, cy, cx + radius * 1.7, cy, 'F');
  doc.setFont('times', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(139, 103, 69);
  doc.text('N', cx, cy - radius - 1.8, { align: 'center' });
}

function drawCornerOrnament(doc: jsPDF, x: number, y: number, sx: number, sy: number) {
  doc.setDrawColor(157, 125, 87);
  doc.setLineWidth(0.28);
  doc.line(x, y, x + 9 * sx, y);
  doc.line(x, y, x, y + 9 * sy);
  doc.setLineWidth(0.18);
  doc.line(x + 1.5 * sx, y + 1.5 * sy, x + 6.5 * sx, y + 1.5 * sy);
  doc.line(x + 1.5 * sx, y + 1.5 * sy, x + 1.5 * sx, y + 6.5 * sy);
  doc.circle(x + 3.2 * sx, y + 3.2 * sy, 0.55, 'S');
}

function drawPageBackground(doc: jsPDF) {
  doc.setFillColor(251, 248, 240);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // More legible antique map, kept behind a quiet central reading field.
  doc.setGState(new GState({ opacity: 0.25 }));
  doc.addImage(WORLD_MAP_DATA, 'PNG', 13, 57, PAGE_W - 26, 151);
  doc.setGState(new GState({ opacity: 1 }));

  // Fine double frame and restrained cartographic edge details.
  doc.setDrawColor(181, 155, 119);
  doc.setLineWidth(0.32);
  doc.rect(8, 8, PAGE_W - 16, PAGE_H - 16);
  doc.setDrawColor(211, 196, 171);
  doc.setLineWidth(0.18);
  doc.rect(10.5, 10.5, PAGE_W - 21, PAGE_H - 21);

  drawCornerOrnament(doc, 12, 12, 1, 1);
  drawCornerOrnament(doc, PAGE_W - 12, 12, -1, 1);
  drawCornerOrnament(doc, 12, PAGE_H - 12, 1, -1);
  drawCornerOrnament(doc, PAGE_W - 12, PAGE_H - 12, -1, -1);
  drawCompass(doc, PAGE_W - 25, 28, 4.2);

  // Delicate lower-edge cartographic rule and centered ornament.
  doc.setDrawColor(181, 155, 119);
  doc.setLineWidth(0.25);
  doc.line(27, PAGE_H - 15, 86, PAGE_H - 15);
  doc.line(124, PAGE_H - 15, PAGE_W - 27, PAGE_H - 15);
  doc.setFillColor(139, 103, 69);
  doc.circle(PAGE_W / 2, PAGE_H - 15, 0.75, 'F');
}

function addCover(doc: jsPDF, journey: Journey, coverPhoto?: string) {
  doc.setFillColor(247, 242, 232);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  if (coverPhoto) {
    const props = doc.getImageProperties(coverPhoto);
    const scale = Math.max(PAGE_W / props.width, PAGE_H / props.height);
    const width = props.width * scale;
    const height = props.height * scale;
    doc.addImage(
      coverPhoto,
      'JPEG',
      (PAGE_W - width) / 2,
      (PAGE_H - height) / 2,
      width,
      height,
    );
    doc.setGState(new GState({ opacity: 0.38 }));
    doc.setFillColor(25, 22, 18);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    doc.setGState(new GState({ opacity: 1 }));
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setDrawColor(185, 166, 139);
    doc.setLineWidth(0.6);
    doc.rect(12, 12, PAGE_W - 24, PAGE_H - 24);
    doc.setTextColor(INK);
  }

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.text('A JOURNEY REMEMBERED', MARGIN + 2, PAGE_H - 83);
  doc.setFont('times', 'bold');
  doc.setFontSize(32);
  const titleLines = doc.splitTextToSize(journey.name, CONTENT_W - 8);
  doc.text(titleLines, MARGIN + 2, PAGE_H - 65);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(clean(journey.place), MARGIN + 2, PAGE_H - 35);
  doc.setFontSize(10);
  doc.text(rangeLabel(journey), MARGIN + 2, PAGE_H - 27);
}

function addPageChrome(doc: jsPDF, journey: Journey, page: number) {
  drawPageBackground(doc);
  doc.setTextColor(ACCENT);
  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  doc.text(journey.name, MARGIN + 1, 17);
  doc.setDrawColor(190, 170, 141);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, 21, PAGE_W - MARGIN, 21);
  doc.setTextColor(MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(String(page), PAGE_W - MARGIN - 1, PAGE_H - 17, { align: 'right' });
}

function memoryMeta(entry: Entry, mode: JourneyExportMode): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  result.push(['Date', dateLabel(entry.date)]);
  if (entry.time) result.push(['Time', entry.time]);
  if (entry.location?.name) result.push(['Place', entry.location.name]);
  if (entry.peopleRefs.length) {
    result.push(['With', entry.peopleRefs.map(person => person.displayName).join(', ')]);
  }

  if (mode === 'comprehensive') {
    if (entry.location?.address) result.push(['Address', entry.location.address]);
    if (entry.location?.countryName) result.push(['Country', entry.location.countryName]);
    if (entry.memoryType) {
      result.push(['Memory type', entry.memoryType.replace(/-/g, ' ')]);
    }
    if (entry.rating !== undefined) result.push(['Rating', `${entry.rating} / 5`]);
    if (entry.tags.length) result.push(['Tags', entry.tags.join('  ·  ')]);
    if (entry.costs.length) {
      result.push([
        'Costs',
        entry.costs.map(cost => `${cost.category}: ${cost.amount.toFixed(2)} ${cost.currency}`).join('  ·  '),
      ]);
    }
  }
  return result;
}

function photoFrame(doc: jsPDF, dataUrl: string, x: number, y: number, width: number, height: number) {
  const props = doc.getImageProperties(dataUrl);
  const scale = Math.min(width / props.width, height / props.height);
  const imageW = props.width * scale;
  const imageH = props.height * scale;
  const imageX = x + (width - imageW) / 2;
  const imageY = y + (height - imageH) / 2;

  doc.setFillColor(255, 253, 248);
  doc.rect(x - 1.1, y - 1.1, width + 2.2, height + 2.2, 'F');
  doc.setDrawColor(190, 170, 141);
  doc.setLineWidth(0.28);
  doc.rect(x - 1.1, y - 1.1, width + 2.2, height + 2.2);
  doc.addImage(dataUrl, 'JPEG', imageX, imageY, imageW, imageH);
}

function drawMetaLine(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): number {
  if (!clean(value)) return y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(ACCENT);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.1);
  doc.setTextColor(INK);
  const lines = doc.splitTextToSize(value, width - 17);
  doc.text(lines, x + 17, y);
  return y + Math.max(5.2, lines.length * 4.1 + 1.2);
}

function addSmallDivider(doc: jsPDF, y: number) {
  doc.setDrawColor(190, 170, 141);
  doc.setLineWidth(0.22);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setFillColor(139, 103, 69);
  doc.circle(PAGE_W / 2, y, 0.65, 'F');
}

function addParagraph(
  doc: jsPDF,
  lines: string[],
  y: number,
  newPage: () => void,
  getY: () => number,
  setY: (value: number) => void,
) {
  const lineHeight = 4.8;
  for (const line of lines) {
    if (getY() + lineHeight > BOTTOM - 1) {
      newPage();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.2);
      doc.setTextColor(INK);
    }
    doc.text(line, MARGIN + 1, getY());
    setY(getY() + lineHeight);
  }
  return y;
}

export async function generateJourneyPdf(
  journey: Journey,
  entries: Entry[],
  mode: JourneyExportMode,
): Promise<void> {
  const chronological = [...entries].sort((a, b) =>
    `${a.date}T${a.time ?? '00:00'}`.localeCompare(`${b.date}T${b.time ?? '00:00'}`),
  );

  const photoUrls = new Set<string>();
  if (journey.anchorPhoto?.url) photoUrls.add(journey.anchorPhoto.url);
  for (const entry of chronological) {
    if (entry.photo?.url) photoUrls.add(entry.photo.url);
  }

  const photoMap = new Map<string, string>();
  for (const url of photoUrls) {
    photoMap.set(url, await loadPhotoAsJpeg(url));
  }

  const coverUrl =
    journey.anchorPhoto?.url ||
    chronological.find(entry => entry.photo?.url)?.photo?.url;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  addCover(doc, journey, coverUrl ? photoMap.get(coverUrl) : undefined);

  doc.addPage();
  let page = 2;
  addPageChrome(doc, journey, page);
  let y = 31;

  const newPage = () => {
    doc.addPage();
    page += 1;
    addPageChrome(doc, journey, page);
    y = 31;
  };

  doc.setFont('times', 'bold');
  doc.setFontSize(21);
  doc.setTextColor(INK);
  doc.text(mode === 'summary' ? 'Journey memories' : 'Journey archive', MARGIN + 1, y);
  y += 12;

  if (mode === 'comprehensive' && clean(journey.place)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text(`Journey place  ·  ${journey.place}`, MARGIN + 1, y);
    y += 8;
  }

  for (const entry of chronological) {
    const photo = entry.photo?.url ? photoMap.get(entry.photo.url) : undefined;
    const meta = memoryMeta(entry, mode);
    const titleWidth = photo ? 82 : CONTENT_W - 4;

    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    const titleLines = doc.splitTextToSize(entry.title, titleWidth);
    const titleHeight = titleLines.length * 6.1 + 2;

    // Let the photograph shape influence the editorial composition.
    let photoW = 0;
    let photoH = 0;
    if (photo) {
      const props = doc.getImageProperties(photo);
      const ratio = props.width / props.height;
      if (ratio < 0.88) {
        photoW = 49;
        photoH = 65;
      } else if (ratio > 1.35) {
        photoW = 72;
        photoH = 48;
      } else {
        photoW = 58;
        photoH = 55;
      }
    }

    const metaX = MARGIN + (photo ? photoW + 8 : 0);
    const metaW = CONTENT_W - (photo ? photoW + 8 : 0);
    let metaHeight = 0;
    for (const [, value] of meta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.1);
      const lines = doc.splitTextToSize(value, Math.max(20, metaW - 17));
      metaHeight += Math.max(5.2, lines.length * 4.1 + 1.2);
    }

    const compositionHeight = photo
      ? Math.max(photoH, titleHeight + 3 + metaHeight)
      : titleHeight + 4 + metaHeight;

    // Keep the memory's visual introduction together where possible.
    if (y + 8 + compositionHeight > BOTTOM) newPage();

    addSmallDivider(doc, y);
    const top = y + 7;

    if (photo) photoFrame(doc, photo, MARGIN + 1, top, photoW, photoH);

    let rightY = top + 5;
    doc.setFont('times', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(INK);
    doc.text(titleLines, photo ? metaX : MARGIN + 1, rightY);
    rightY += titleHeight;

    if (meta.length) {
      rightY += 1;
      for (const [label, value] of meta) {
        rightY = drawMetaLine(doc, label, value, photo ? metaX : MARGIN + 1, rightY, photo ? metaW : CONTENT_W - 2);
      }
    }

    y = top + compositionHeight + 5;

    if (mode === 'comprehensive' && clean(entry.highlight)) {
      const highlightLines = doc.splitTextToSize(`“${clean(entry.highlight)}”`, CONTENT_W - 8);
      const blockHeight = highlightLines.length * 4.8 + 8;
      if (y + blockHeight > BOTTOM) newPage();
      doc.setFillColor(244, 237, 224);
      doc.roundedRect(MARGIN + 1, y, CONTENT_W - 2, blockHeight, 1.5, 1.5, 'F');
      doc.setFont('times', 'italic');
      doc.setFontSize(10.5);
      doc.setTextColor(ACCENT);
      doc.text(highlightLines, MARGIN + 5, y + 5.2);
      y += blockHeight + 3;
    }

    if (mode === 'comprehensive' && clean(entry.photo?.caption)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.8);
      doc.setTextColor(MUTED);
      const captionLines = doc.splitTextToSize(`Photograph  ·  ${clean(entry.photo?.caption)}`, CONTENT_W - 4);
      const captionHeight = captionLines.length * 4.2 + 2;
      if (y + captionHeight > BOTTOM) newPage();
      doc.text(captionLines, MARGIN + 1, y);
      y += captionHeight + 2;
    }

    const story = clean(entry.story);
    if (story) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.2);
      doc.setTextColor(INK);
      const storyLines = doc.splitTextToSize(story, CONTENT_W - 2);
      if (y + 4.8 > BOTTOM - 1 && storyLines.length > 1) newPage();
      addParagraph(doc, storyLines, y, newPage, () => y, value => { y = value; });
      y += 4;
    } else {
      y += 2;
    }

    y += 4;
    if (y > BOTTOM - 8) newPage();
  }

  if (mode === 'comprehensive' && clean(journey.googlePhotosUrl)) {
    if (y + 20 > BOTTOM) newPage();
    addSmallDivider(doc, y + 1);
    y += 9;
    doc.setFont('times', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(ACCENT);
    doc.text('Journey photo collection', MARGIN + 1, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(INK);
    doc.textWithLink('Open Google Photos album', MARGIN + 1, y, {
      url: journey.googlePhotosUrl!,
    });
  }

  const safeName = journey.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'journey';

  doc.save(`${safeName}-${mode}.pdf`);
}
