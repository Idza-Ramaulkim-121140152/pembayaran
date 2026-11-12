<?php

namespace App\Support;

class PdfImageHelper
{
    /**
     * Encode a local image into a base64 data URI, downscaling oversized raster
     * images so DomPDF does not exhaust PHP memory decomposing full-resolution RGBA PNGs.
     */
    public static function toDataUri(string $path, int $maxWidth = 480): ?string
    {
        if (!is_file($path)) {
            return null;
        }

        $mimeType = mime_content_type($path) ?: 'image/png';
        $rawBytes = (string) file_get_contents($path);

        if ($maxWidth > 0 && function_exists('getimagesize') && function_exists('imagecreatefromstring')) {
            $info = @getimagesize($path);
            $width = is_array($info) ? (int) ($info[0] ?? 0) : 0;
            $height = is_array($info) ? (int) ($info[1] ?? 0) : 0;

            if ($width > $maxWidth && $height > 0) {
                $targetHeight = max(1, (int) round(($height * $maxWidth) / $width));
                $src = @imagecreatefromstring($rawBytes);

                if ($src !== false) {
                    $dst = imagecreatetruecolor($maxWidth, $targetHeight);
                    if ($dst !== false) {
                        imagealphablending($dst, false);
                        imagesavealpha($dst, true);
                        $transparent = imagecolorallocatealpha($dst, 255, 255, 255, 127);
                        imagefilledrectangle($dst, 0, 0, $maxWidth, $targetHeight, $transparent);
                        imagecopyresampled($dst, $src, 0, 0, 0, 0, $maxWidth, $targetHeight, $width, $height);

                        ob_start();
                        imagepng($dst, null, 6);
                        $resizedBytes = (string) ob_get_clean();

                        imagedestroy($dst);
                        imagedestroy($src);

                        if ($resizedBytes !== '') {
                            return 'data:image/png;base64,' . base64_encode($resizedBytes);
                        }
                    } else {
                        imagedestroy($src);
                    }
                }
            }
        }

        return 'data:' . $mimeType . ';base64,' . base64_encode($rawBytes);
    }
}
