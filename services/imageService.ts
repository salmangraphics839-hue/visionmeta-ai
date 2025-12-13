import piexif from "piexifjs";
import { StockMetadata } from "../types";

// --- CONFIGURATION FOR TURBO MODE ---
const MAX_IMAGE_DIM = 1024;      // Resize standard images to max 1024px
const MAX_VIDEO_FRAME_DIM = 400; // Resize video frames to 400px (Resulting grid: 800x800)
const JPEG_QUALITY = 0.7;        // Balance speed and quality

// --- HELPER: RESIZE IMAGE (The "Shrink Ray") ---
const resizeImageBase64 = (base64Str: string, mimeType: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,${base64Str}`;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > height) {
        if (width > MAX_IMAGE_DIM) {
          height *= MAX_IMAGE_DIM / width;
          width = MAX_IMAGE_DIM;
        }
      } else {
        if (height > MAX_IMAGE_DIM) {
          width *= MAX_IMAGE_DIM / height;
          height = MAX_IMAGE_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Canvas context failed")); return; }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Export compressed JPEG
      const resizedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      // Remove header to get raw base64
      resolve(resizedDataUrl.split(',')[1]);
    };
    img.onerror = (e) => reject(e);
  });
};

// --- VIDEO PROCESSING UTILS (The Turbo Storyboard) ---

// Extracts 4 frames from a video, RESIZES them for speed, and stitches into a grid
const videoToStoryboardBase64 = async (videoFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    // Wait for metadata to load
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      // AGGRESSIVE RESIZING: Shrink frames to MAX_VIDEO_FRAME_DIM (e.g. 400px)
      // This prevents 4K videos from creating massive payloads that crash the server
      if (width > height) {
         if (width > MAX_VIDEO_FRAME_DIM) { 
             height *= MAX_VIDEO_FRAME_DIM / width; 
             width = MAX_VIDEO_FRAME_DIM; 
         }
      } else {
         if (height > MAX_VIDEO_FRAME_DIM) { 
             width *= MAX_VIDEO_FRAME_DIM / height; 
             height = MAX_VIDEO_FRAME_DIM; 
         }
      }
      
      // Capture points: 10%, 35%, 60%, 85%
      const timePoints = [duration * 0.1, duration * 0.35, duration * 0.6, duration * 0.85];
      
      const canvas = document.createElement('canvas');
      // 2x2 Grid Layout
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      const captureFrame = (time: number, index: number): Promise<void> => {
        return new Promise((res) => {
          video.currentTime = time;
          const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            
            // Grid Position: (0,0), (1,0), (0,1), (1,1)
            const x = (index % 2) * width;
            const y = Math.floor(index / 2) * height;
            
            // Draw scaled image directly onto canvas
            ctx.drawImage(video, x, y, width, height);
            res();
          };
          video.addEventListener('seeked', onSeek);
        });
      };

      try {
        for (let i = 0; i < timePoints.length; i++) {
          await captureFrame(timePoints[i], i);
        }
        
        // Export highly compressed JPEG (Small payload = Fast API)
        const base64Url = canvas.toDataURL('image/jpeg', JPEG_QUALITY); 
        const base64Clean = base64Url.includes(',') ? base64Url.split(',')[1] : base64Url;
        
        resolve(base64Clean);
        
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(video.src);
        video.remove();
        canvas.remove();
      }
    };

    video.onerror = () => reject(new Error("Failed to load video file"));
  });
};

// --- FILE CONVERSION (UPDATED WITH TURBO LOGIC) ---

export const fileToBase64 = async (file: File): Promise<string> => {
  // 1. VIDEO HANDLER (Use Turbo Storyboard)
  if (file.type.startsWith('video/') || file.name.toLowerCase().match(/\.(mp4|mov|avi|webm)$/)) {
      try {
          console.log("Processing video storyboard...");
          return await videoToStoryboardBase64(file);
      } catch (e) {
          console.error("Storyboard generation failed", e);
          throw new Error("Failed to process video. File might be corrupt.");
      }
  }

  // 2. IMAGE HANDLER (With Auto-Resize)
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const result = reader.result as string;
      const rawBase64 = result.includes(',') ? result.split(',')[1] : result;
      
      // Optimization: Resize heavy images (>500KB) before sending
      if (file.size > 500 * 1024) {
          try {
              const resized = await resizeImageBase64(rawBase64, file.type);
              resolve(resized);
          } catch (e) {
              console.warn("Resize failed, using original", e);
              resolve(rawBase64);
          }
      } else {
          // Small images are sent as-is
          resolve(rawBase64);
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

export const getPreviewUrl = (file: File): string => {
  return URL.createObjectURL(file);
};

// CRC32 Table for PNG Chunk calculation
const makeCRCTable = () => {
    let c;
    const crcTable = [];
    for(let n =0; n < 256; n++){
        c = n;
        for(let k =0; k < 8; k++){
            c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}
const crcTable = makeCRCTable();

const crc32 = (buf: Uint8Array): number => {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++ ) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
};

// --- XMP GENERATION (Existing Functionality Preserved) ---

export const generateXmpPacket = (metadata: StockMetadata, mimeType: string = "image/jpeg"): string => {
  const sanitize = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="VisionMeta AI Tagger">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
        xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">
      <dc:format>${mimeType}</dc:format>
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${sanitize(metadata.title)}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${sanitize(metadata.description)}</rdf:li>
        </rdf:Alt>
      </dc:description>
      <dc:subject>
        <rdf:Bag>
          ${metadata.keywords.map(kw => `<rdf:li>${sanitize(kw)}</rdf:li>`).join('\n          ')}
        </rdf:Bag>
      </dc:subject>
      <photoshop:Headline>${sanitize(metadata.title)}</photoshop:Headline>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
};

// --- FORMAT SPECIFIC INJECTORS (Existing Functionality Preserved) ---

// 1. JPEG Injector (EXIF + XMP)
const embedMetadataInJpeg = async (file: File, metadata: StockMetadata): Promise<Blob> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const jpegDataUrl = e.target?.result as string;
        
        // 1. Embed EXIF
        const zeroth: { [key: string]: any } = {};
        const exif: { [key: string]: any } = {};
        const gps: { [key: string]: any } = {};

        const strToUCS2 = (str: string) => {
          const res = [];
          for (let i = 0; i < str.length; i++) {
             const code = str.charCodeAt(i);
             res.push(code & 0xFF);
             res.push((code >> 8) & 0xFF);
          }
          res.push(0); res.push(0);
          return res;
        };

        zeroth[piexif.ImageIFD.ImageDescription] = metadata.title + " - " + metadata.description;
        zeroth[piexif.ImageIFD.XPTitle] = strToUCS2(metadata.title);
        zeroth[piexif.ImageIFD.XPComment] = strToUCS2(metadata.description);
        zeroth[piexif.ImageIFD.XPKeywords] = strToUCS2(metadata.keywords.join(";"));
        zeroth[piexif.ImageIFD.Software] = "VisionMeta AI Tagger";

        const exifObj = { "0th": zeroth, "Exif": exif, "GPS": gps };
        const exifBytes = piexif.dump(exifObj);
        const newJpegWithExif = piexif.insert(exifBytes, jpegDataUrl);

        // 2. Prepare for XMP
        const raw = atob(newJpegWithExif.split(',')[1]);
        const fileBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) fileBytes[i] = raw.charCodeAt(i);

        // 3. Generate & Embed XMP
        const xmpStr = generateXmpPacket(metadata, "image/jpeg");
        const encoder = new TextEncoder();
        const xmpBytes = encoder.encode(xmpStr);
        const headerBytes = encoder.encode("http://ns.adobe.com/xap/1.0/\x00");
        
        const app1Len = 2 + 2 + headerBytes.length + xmpBytes.length;
        const app1 = new Uint8Array(app1Len);
        let offset = 0;

        app1[0] = 0xFF; app1[1] = 0xE1; offset += 2;
        app1[offset++] = (app1Len >> 8) & 0xFF; app1[offset++] = app1Len & 0xFF;
        app1.set(headerBytes, offset); offset += headerBytes.length;
        app1.set(xmpBytes, offset);

        if (fileBytes[0] === 0xFF && fileBytes[1] === 0xD8) {
            const finalBytes = new Uint8Array(fileBytes.length + app1.length);
            finalBytes.set(fileBytes.slice(0, 2), 0);
            finalBytes.set(app1, 2);
            finalBytes.set(fileBytes.slice(2), 2 + app1.length);
            resolve(new Blob([finalBytes], { type: "image/jpeg" }));
        } else {
            resolve(new Blob([fileBytes], { type: "image/jpeg" }));
        }
      } catch (err) { resolve(file); }
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

// 2. SVG Injector
export const embedMetadataInSvg = async (file: File, metadata: StockMetadata): Promise<Blob> => {
  const text = await file.text();
  const xmp = generateXmpPacket(metadata, "image/svg+xml");
  let newSvgContent = text;
  if (text.includes('<metadata>')) {
    newSvgContent = text.replace(/<metadata>(.*?)<\/metadata>/s, `<metadata>${xmp}</metadata>`);
  } else if (text.includes('</svg>')) {
    newSvgContent = text.replace('</svg>', `<metadata>${xmp}</metadata></svg>`);
  } else {
    newSvgContent = text + `\n<metadata>${xmp}</metadata>`;
  }
  return new Blob([newSvgContent], { type: "image/svg+xml" });
};

// 3. EPS Injector
const embedMetadataInEps = async (file: File, metadata: StockMetadata): Promise<Blob> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;
                if (!buffer) { resolve(file); return; }
                const data = new Uint8Array(buffer);

                const findBinarySequence = (haystack: Uint8Array, pattern: string, limit?: number): number => {
                    const seq = new Uint8Array(pattern.length);
                    for (let i = 0; i < pattern.length; i++) seq[i] = pattern.charCodeAt(i);
                    const len = haystack.length;
                    const seqLen = seq.length;
                    const max = limit ? Math.min(len, limit) : len;
                    for (let i = 0; i <= max - seqLen; i++) {
                        let match = true;
                        for (let j = 0; j < seqLen; j++) if (haystack[i + j] !== seq[j]) { match = false; break; }
                        if (match) return i;
                    }
                    return -1;
                };

                let insertIndex = -1;
                const endCommentsIndex = findBinarySequence(data, "%%EndComments");
                
                if (endCommentsIndex !== -1) {
                    insertIndex = endCommentsIndex + 13;
                } else {
                    const headerIndex = findBinarySequence(data, "%!PS-Adobe", 1024);
                    if (headerIndex !== -1) insertIndex = headerIndex + 10; 
                    else insertIndex = 0;
                }

                const xmp = generateXmpPacket(metadata, "application/postscript");
                const xmpLines = xmp.split('\n');
                const commentedXmp = xmpLines.map(line => `% ${line}`).join('\n');
                const packetStr = `\n%begin_xml_packet: w begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"\n${commentedXmp}\n%end_xml_packet\n`;
                const packetBytes = new TextEncoder().encode(packetStr);

                const newBlob = new Blob([
                    data.slice(0, insertIndex),
                    packetBytes,
                    data.slice(insertIndex)
                ], { type: file.type || 'application/postscript' });

                resolve(newBlob);
            } catch (err) { resolve(file); }
        };
        reader.onerror = () => resolve(file);
        reader.readAsArrayBuffer(file);
    });
};

// 4. PNG Injector
const embedMetadataInPng = async (file: File, metadata: StockMetadata): Promise<Blob> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const buffer = e.target?.result as ArrayBuffer;
            if (!buffer) { resolve(file); return; }
            const uint8 = new Uint8Array(buffer);
            if (uint8[0] !== 0x89 || uint8[1] !== 0x50) { resolve(file); return; }

            const xmp = generateXmpPacket(metadata, "image/png");
            const keyword = "XML:com.adobe.xmp";
            const keywordBytes = new TextEncoder().encode(keyword);
            const xmpBytes = new TextEncoder().encode(xmp);
            
            const dataLen = keywordBytes.length + 5 + xmpBytes.length;
            const chunkData = new Uint8Array(dataLen);
            let offset = 0;
            chunkData.set(keywordBytes, offset); offset += keywordBytes.length;
            chunkData[offset++] = 0; chunkData[offset++] = 0; chunkData[offset++] = 0; chunkData[offset++] = 0; chunkData[offset++] = 0;
            chunkData.set(xmpBytes, offset);
            
            const typeStr = "iTXt";
            const typeBytes = new TextEncoder().encode(typeStr);
            const crcBuff = new Uint8Array(typeBytes.length + chunkData.length);
            crcBuff.set(typeBytes, 0); crcBuff.set(chunkData, typeBytes.length);
            const crcVal = crc32(crcBuff);
            
            const fullChunk = new Uint8Array(8 + chunkData.length + 4);
            const view = new DataView(fullChunk.buffer);
            view.setUint32(0, chunkData.length, false);
            fullChunk.set(typeBytes, 4);
            fullChunk.set(chunkData, 8);
            view.setUint32(8 + chunkData.length, crcVal, false);
            
            const newPngBuffer = new Uint8Array(uint8.length + fullChunk.length);
            newPngBuffer.set(uint8.slice(0, 33), 0);
            newPngBuffer.set(fullChunk, 33);
            newPngBuffer.set(uint8.slice(33), 33 + fullChunk.length);
            
            resolve(new Blob([newPngBuffer], { type: "image/png" }));
        };
        reader.onerror = () => resolve(file);
        reader.readAsArrayBuffer(file);
    });
};

// 5. Video Injector (MP4/MOV)
const embedMetadataInVideo = async (file: File, metadata: StockMetadata): Promise<Blob> => {
    const xmp = generateXmpPacket(metadata, file.type || "video/mp4");
    const encoder = new TextEncoder();
    const xmpBytes = encoder.encode(xmp);
    const uuid = new Uint8Array([0xBE, 0x7A, 0xCF, 0xCB, 0x97, 0xA9, 0x42, 0xE8, 0x9C, 0x71, 0x99, 0x94, 0x91, 0xE3, 0xAF, 0xAC]);
    const boxSize = 4 + 4 + 16 + xmpBytes.length;
    const box = new Uint8Array(boxSize);
    const view = new DataView(box.buffer);
    view.setUint32(0, boxSize, false);
    box.set(encoder.encode("uuid"), 4);
    box.set(uuid, 8);
    box.set(xmpBytes, 24);
    return new Blob([file, box], { type: file.type });
};

// --- MAIN HANDLER ---
export const embedMetadata = async (file: File, metadata: StockMetadata): Promise<Blob> => {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return embedMetadataInJpeg(file, metadata);
  if (type === 'image/png' || name.endsWith('.png')) return embedMetadataInPng(file, metadata);
  if (type === 'image/svg+xml' || name.endsWith('.svg')) return embedMetadataInSvg(file, metadata);
  if (name.endsWith('.eps')) return embedMetadataInEps(file, metadata);
  if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov')) return embedMetadataInVideo(file, metadata);

  return file;
};