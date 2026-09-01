/**
 * Client-Side Image Compressor Utility
 * Optimizes large smartphone camera photos (e.g. 3MB - 15MB) into lightweight JPEGs (100KB - 350KB)
 * directly in the browser canvas before uploading to the server.
 */

/**
 * Format bytes to readable size string (e.g. 2.4 MB, 180 KB)
 * @param {number} bytes 
 * @returns {string}
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Compress an image file using browser HTML5 Canvas.
 * 
 * @param {File|Blob} file The input image file
 * @param {Object} options Compression configuration
 * @param {number} options.maxWidth Maximum width in pixels (default: 1600)
 * @param {number} options.maxHeight Maximum height in pixels (default: 1600)
 * @param {number} options.quality JPEG quality from 0 to 1 (default: 0.8)
 * @param {string} options.outputType Target MIME type (default: 'image/jpeg')
 * @returns {Promise<{ file: File, previewUrl: string, originalSize: number, compressedSize: number, ratio: number }>}
 */
export async function compressImage(file, options = {}) {
    const {
        maxWidth = 1600,
        maxHeight = 1600,
        quality = 0.8,
        outputType = 'image/jpeg',
    } = options;

    if (!file || !file.type || !file.type.startsWith('image/')) {
        return {
            file,
            previewUrl: file instanceof Blob ? URL.createObjectURL(file) : null,
            originalSize: file?.size || 0,
            compressedSize: file?.size || 0,
            ratio: 0,
        };
    }

    const originalSize = file.size;

    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onerror = () => {
            resolve({
                file,
                previewUrl: URL.createObjectURL(file),
                originalSize,
                compressedSize: originalSize,
                ratio: 0,
            });
        };

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => {
                resolve({
                    file,
                    previewUrl: URL.createObjectURL(file),
                    originalSize,
                    compressedSize: originalSize,
                    ratio: 0,
                });
            };

            img.onload = () => {
                let { width, height } = img;

                // Scale down maintaining aspect ratio
                if (width > maxWidth || height > maxHeight) {
                    if (width / height > maxWidth / maxHeight) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, width);
                canvas.height = Math.max(1, height);

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve({
                        file,
                        previewUrl: URL.createObjectURL(file),
                        originalSize,
                        compressedSize: originalSize,
                        ratio: 0,
                    });
                    return;
                }

                // Enable smooth interpolation
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw background white for transparent PNG conversion to JPEG
                if (outputType === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            resolve({
                                file,
                                previewUrl: URL.createObjectURL(file),
                                originalSize,
                                compressedSize: originalSize,
                                ratio: 0,
                            });
                            return;
                        }

                        // Determine new file name with .jpg
                        const originalName = file.name || 'photo.jpg';
                        const baseName = originalName.replace(/\.[^/.]+$/, '');
                        const newExtension = outputType === 'image/jpeg' ? '.jpg' : '.webp';
                        const newFileName = `${baseName}${newExtension}`;

                        const compressedFile = new File([blob], newFileName, {
                            type: outputType,
                            lastModified: Date.now(),
                        });

                        const compressedSize = compressedFile.size;
                        const ratio = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));
                        const previewUrl = URL.createObjectURL(compressedFile);

                        resolve({
                            file: compressedFile,
                            previewUrl,
                            originalSize,
                            compressedSize,
                            ratio,
                        });
                    },
                    outputType,
                    quality
                );
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
}
