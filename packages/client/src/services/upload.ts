import type { FileAttachment } from '../types';

export type ImageQuality = 'original' | 'high' | 'medium' | 'low';

const IMAGE_QUALITY_PRESETS: Record<ImageQuality, { maxDimension: number; quality: number }> = {
  original: { maxDimension: Infinity, quality: 1.0 },
  high:     { maxDimension: 2048,     quality: 0.85 },
  medium:   { maxDimension: 1280,     quality: 0.75 },
  low:      { maxDimension: 800,      quality: 0.6 },
};

/**
 * Compress an image file using Canvas.
 * Returns the original file if it's not an image or quality is 'original'.
 */
async function compressImage(file: File, preset: ImageQuality): Promise<File> {
  if (preset === 'original' || !file.type.startsWith('image/')) return file;
  // Skip GIFs (animated) and SVGs
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  const { maxDimension, quality } = IMAGE_QUALITY_PRESETS[preset];

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // No resize needed if already small enough
      if (width <= maxDimension && height <= maxDimension) {
        // Still re-encode to compress quality
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              resolve(file); // Compressed is larger, keep original
            }
          },
          'image/jpeg',
          quality,
        );
        return;
      }

      // Scale down
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressed = new File([blob], file.name, { type: 'image/jpeg' });
            console.log(`[Upload] Compressed ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${width}×${height})`);
            resolve(compressed);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => resolve(file); // Fallback to original on error
    img.src = URL.createObjectURL(file);
  });
}

/** Default image quality — change via UI */
let defaultImageQuality: ImageQuality = 'medium';

export function setDefaultImageQuality(q: ImageQuality) {
  defaultImageQuality = q;
}

export function getDefaultImageQuality(): ImageQuality {
  return defaultImageQuality;
}

export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void,
  imageQuality?: ImageQuality,
): Promise<FileAttachment> {
  const processedFile = await compressImage(file, imageQuality ?? defaultImageQuality);
  const formData = new FormData();
  formData.append('file', processedFile);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.send(formData);
  });
}
