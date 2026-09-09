/**
 * High-Reliability Adaptive System Update Uploader
 * Slices update package (dist.zip / project zip) into Base64 JSON chunks
 * with automatic per-chunk retry, timeout protection, rate-limit pacing,
 * and dual-URL fallback to reliably upload on any personal hosting, cPanel, LiteSpeed, Nginx, or VPS.
 */

export interface UpdateResponse {
  status: string;
  message: string;
  backupCreated?: string | null;
  extractedCount?: number;
  skippedCount?: number;
  error?: string;
}

// Convert a Blob slice to a Base64 string reliably
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("خطا در تبدیل قطعه به داده Base64"));
    reader.readAsDataURL(blob);
  });
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send a single chunk with robust per-chunk retries, timeout protection, and dual-URL routing
 */
async function sendSingleChunkWithRetry(
  primaryUrl: string,
  fallbackUrl: string,
  payload: any,
  chunkIndex: number,
  totalChunks: number,
  maxRetries = 5,
  onRetryNotify?: (attempt: number, max: number, reason: string) => void
): Promise<{ ok: boolean; status: number; text: string; data: any; error?: string; isTooLarge?: boolean; isNotFound?: boolean }> {
  const jsonBody = JSON.stringify(payload);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    let response: Response | null = null;
    let lastErr: any = null;

    // 1. Try primary URL
    try {
      response = await fetch(primaryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-upload-id': payload.uploadId,
          'x-chunk-index': String(chunkIndex),
          'x-total-chunks': String(totalChunks)
        },
        body: jsonBody,
        signal: controller.signal
      });
    } catch (err: any) {
      lastErr = err;
      // 2. If primary URL failed (CORS, network drop, rewrite failure), try direct api.php fallback URL
      try {
        response = await fetch(fallbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-upload-id': payload.uploadId,
            'x-chunk-index': String(chunkIndex),
            'x-total-chunks': String(totalChunks)
          },
          body: jsonBody,
          signal: controller.signal
        });
        lastErr = null;
      } catch (fallbackErr: any) {
        lastErr = fallbackErr;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // If network / fetch failed completely
    if (!response) {
      const isAbort = lastErr?.name === 'AbortError';
      const reasonMsg = isAbort ? 'پایان زمان انتظار سرور (Timeout)' : (lastErr?.message || 'اختلال در اتصال شبکه');

      if (attempt < maxRetries) {
        const backoffMs = Math.min(600 * Math.pow(1.6, attempt - 1), 5000);
        if (onRetryNotify) {
          onRetryNotify(attempt, maxRetries, reasonMsg);
        }
        await sleep(backoffMs);
        continue;
      }

      return {
        ok: false,
        status: 0,
        text: '',
        data: null,
        error: `خطای شبکه در ارسال قطعه ${chunkIndex + 1}: ${reasonMsg}`
      };
    }

    // Read response text safely
    let responseText = '';
    try {
      responseText = await response.text();
    } catch (readErr: any) {
      if (attempt < maxRetries) {
        if (onRetryNotify) onRetryNotify(attempt, maxRetries, 'خطا در دریافت پاسخ سرور');
        await sleep(800);
        continue;
      }
      return { ok: false, status: response.status, text: '', data: null, error: `خطا در خواندن پاسخ قطعه ${chunkIndex + 1}` };
    }

    // Check 404 (Endpoint not supported)
    if (response.status === 404) {
      return { ok: false, status: 404, text: responseText, data: null, isNotFound: true, error: 'CHUNK_ENDPOINT_NOT_FOUND' };
    }

    // Check 413 (Payload Too Large)
    if (
      response.status === 413 ||
      responseText.includes('413') ||
      responseText.toLowerCase().includes('too large') ||
      responseText.toLowerCase().includes('entity too large') ||
      responseText.toLowerCase().includes('payload')
    ) {
      return { ok: false, status: 413, text: responseText, data: null, isTooLarge: true, error: 'حجم قطعه ارسالی بیش از حد مجاز پراکسی سرور است.' };
    }

    // Check server error (500, 502, 503, 504) -> auto retry with backoff
    if (response.status >= 500 && attempt < maxRetries) {
      const backoffMs = Math.min(800 * attempt, 4000);
      if (onRetryNotify) {
        onRetryNotify(attempt, maxRetries, `پاسخ موقت خطای سرور (${response.status})`);
      }
      await sleep(backoffMs);
      continue;
    }

    // Parse JSON
    let parsedData: any = null;
    try {
      parsedData = JSON.parse(responseText);
    } catch (_e) {
      // Non-JSON response
      if (response.ok) {
        return { ok: true, status: response.status, text: responseText, data: { status: 'chunk_received' } };
      }
      if (attempt < maxRetries) {
        await sleep(800);
        continue;
      }
      return { ok: false, status: response.status, text: responseText, data: null, error: `پاسخ نامعتبر از سرور (کد وضعیت: ${response.status})` };
    }

    if (!response.ok) {
      const errMsg = parsedData?.error || `خطا در سرور هنگام ذخیره قطعه ${chunkIndex + 1} (کد: ${response.status})`;
      if (attempt < maxRetries) {
        await sleep(800);
        continue;
      }
      return { ok: false, status: response.status, text: responseText, data: parsedData, error: errMsg };
    }

    // Success!
    return { ok: true, status: response.status, text: responseText, data: parsedData };
  }

  return { ok: false, status: 0, text: '', data: null, error: `ارسال قطعه ${chunkIndex + 1} پس از ${maxRetries} تلاش ناموفق بود.` };
}

/**
 * Perform chunked upload with a specific chunk size, per-chunk retry, and pacing
 */
async function sendChunksWithFixedSize(
  file: File,
  chunkSize: number,
  onProgress?: (percent: number, statusText: string) => void
): Promise<{ success: boolean; result?: UpdateResponse; errorType?: 'TOO_LARGE' | 'NOT_FOUND' | 'OTHER'; errorMessage?: string }> {
  const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const totalChunks = Math.ceil(file.size / chunkSize);

  if (totalChunks === 0) {
    return { success: false, errorType: 'OTHER', errorMessage: 'فایل ارسالی خالی است.' };
  }

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunkBlob = file.slice(start, end);
    const isLastChunk = chunkIndex === totalChunks - 1;

    const uploadPercent = Math.round(((chunkIndex + 1) / totalChunks) * 88);
    const sizeKb = Math.round(chunkSize / 1024);

    if (onProgress) {
      if (isLastChunk) {
        onProgress(90, "در حال استخراج و جایگزینی فایل‌های سیستم روی هاست (لطفاً کمی صبر کنید)...");
      } else {
        onProgress(
          uploadPercent,
          `در حال ارسال قطعه ${chunkIndex + 1} از ${totalChunks} (${sizeKb}KB) - ${uploadPercent}٪...`
        );
      }
    }

    const chunkBase64 = await blobToBase64(chunkBlob);

    const queryParams = `uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${chunkIndex}&totalChunks=${totalChunks}`;
    const primaryUrl = `/api/system/update-chunk?${queryParams}`;
    const fallbackUrl = `/api.php?route=system/update-chunk&${queryParams}`;

    const payload = {
      uploadId,
      chunkIndex,
      totalChunks,
      totalSize: file.size,
      chunkBase64,
    };

    const chunkResult = await sendSingleChunkWithRetry(
      primaryUrl,
      fallbackUrl,
      payload,
      chunkIndex,
      totalChunks,
      5, // 5 retries per chunk
      (attempt, max, reason) => {
        if (onProgress) {
          onProgress(
            uploadPercent,
            `در حال تلاش مجدد ارسال قطعه ${chunkIndex + 1} از ${totalChunks} (${reason} - تلاش ${attempt + 1} از ${max})...`
          );
        }
      }
    );

    if (!chunkResult.ok) {
      if (chunkResult.isNotFound) {
        return { success: false, errorType: 'NOT_FOUND', errorMessage: 'CHUNK_ENDPOINT_NOT_FOUND' };
      }
      if (chunkResult.isTooLarge) {
        return { success: false, errorType: 'TOO_LARGE', errorMessage: 'حجم قطعه ارسالی بیش از حد مجاز پراکسی سرور است.' };
      }
      return {
        success: false,
        errorType: 'OTHER',
        errorMessage: chunkResult.error || `خطا در ارسال قطعه ${chunkIndex + 1}`
      };
    }

    if (isLastChunk) {
      if (onProgress) {
        onProgress(100, "به‌روزرسانی با موفقیت اعمال گردید!");
      }
      return { success: true, result: chunkResult.data as UpdateResponse };
    }

    // Polite delay between chunks (40ms) to prevent shared host rate limit triggers
    await sleep(40);
  }

  return { success: false, errorType: 'OTHER', errorMessage: 'فرآیند ارسال قطعات به اتمام نرسید.' };
}

/**
 * Adaptive Multi-Strategy Uploader
 * Uses standard safe chunk size (128 KB) with intelligent per-chunk retries.
 * Only steps down if host explicitly returns 413 (Payload Too Large).
 */
export async function uploadSystemUpdateFile(
  file: File,
  onProgress?: (percent: number, statusText: string) => void
): Promise<UpdateResponse> {
  const CHUNK_SIZES_TO_TRY = [
    128 * 1024,  // 128 KB (Optimal, low request count ~22 chunks for 2.8MB, fast & reliable)
    64 * 1024,   // 64 KB (Strict proxy fallback)
    32 * 1024,   // 32 KB (Extreme constraint fallback)
  ];

  for (let i = 0; i < CHUNK_SIZES_TO_TRY.length; i++) {
    const currentChunkSize = CHUNK_SIZES_TO_TRY[i];
    const sizeKb = Math.round(currentChunkSize / 1024);

    if (i > 0 && onProgress) {
      onProgress(
        10,
        `تنظیم خودکار قطعات به اندازه کوچک‌تر (${sizeKb}KB) به دلیل محدودیت حجم پراکسی هاست...`
      );
    }

    const chunkAttempt = await sendChunksWithFixedSize(file, currentChunkSize, onProgress);

    if (chunkAttempt.success && chunkAttempt.result) {
      return chunkAttempt.result;
    }

    if (chunkAttempt.errorType === 'NOT_FOUND') {
      console.warn("Chunk endpoint not available on host, falling back to direct single payload update...");
      return await fallbackSingleUpload(file, onProgress);
    }

    if (chunkAttempt.errorType === 'TOO_LARGE') {
      console.warn(`Chunk size ${sizeKb}KB restricted by server (413). Stepping down...`);
      continue;
    }

    // For other fatal errors where all per-chunk retries failed on the last attempt:
    if (i === CHUNK_SIZES_TO_TRY.length - 1) {
      console.warn("Chunk upload failed after all retries, attempting single payload fallback...", chunkAttempt.errorMessage);
      try {
        return await fallbackSingleUpload(file, onProgress);
      } catch (_) {
        throw new Error(chunkAttempt.errorMessage || "خطا در ارسال فایل به‌روزرسانی به سرور.");
      }
    }
  }

  return await fallbackSingleUpload(file, onProgress);
}

/**
 * Fallback to single payload update if server does not have chunk endpoint
 */
async function fallbackSingleUpload(
  file: File,
  onProgress?: (percent: number, statusText: string) => void
): Promise<UpdateResponse> {
  if (onProgress) {
    onProgress(50, "در حال آماده‌سازی و ارسال مستقیم پکیج به‌روزرسانی...");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        if (onProgress) {
          onProgress(75, "در حال ارسال داده‌ها به سرور...");
        }

        let response: Response;
        try {
          response = await fetch('/api/system/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zipBase64: base64String }),
          });
        } catch (_err) {
          response = await fetch('/api.php?route=system/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zipBase64: base64String }),
          });
        }

        const responseText = await response.text();
        let result: any = null;
        try {
          result = JSON.parse(responseText);
        } catch (_parseErr) {
          if (response.status === 413 || responseText.includes('413') || responseText.toLowerCase().includes('too large')) {
            return reject(new Error("خطا: حجم فایل ارسالی بیش از حد مجاز سرور/پراکسی است. لطفاً هاست را روی پشتیبانی از فایل‌های بزرگتر تنظیم نمایید یا پکیج dist.zip را آپلود کنید."));
          }
          return reject(new Error(`پاسخ سرور معتبر نبود (کد وضعیت: ${response.status}).`));
        }

        if (response.ok && result.status === 'success') {
          if (onProgress) onProgress(100, "به‌روزرسانی با موفقیت انجام شد!");
          resolve(result);
        } else {
          reject(new Error(result?.error || "خطایی در فرآیند به‌روزرسانی رخ داد."));
        }
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("خطا در خواندن فایل زیپ."));
    reader.readAsDataURL(file);
  });
}
