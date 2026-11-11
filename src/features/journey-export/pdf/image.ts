/**
 * Fetches a Firebase download URL and converts it to JPEG for jsPDF.
 * Export fails visibly if a photograph cannot be embedded; it never silently
 * produces a PDF with missing photographs.
 */
export async function loadPhotoAsJpeg(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load a journey photograph (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('A journey photograph could not be read as an image.');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('A journey photograph could not be decoded.'));
    });

    const canvas = document.createElement('canvas');
    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare a photograph for PDF export.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function imageDimensions(dataUrl: string): { width: number; height: number } {
  const image = new Image();
  image.src = dataUrl;
  // The image is already decoded by loadPhotoAsJpeg before use.
  return { width: image.naturalWidth || 4, height: image.naturalHeight || 3 };
}
