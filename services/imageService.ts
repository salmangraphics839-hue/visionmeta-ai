import piexif from "piexifjs";
import { StockMetadata } from "../types";

// --- SMART CONFIGURATION ---
// Strategy: "Only downsize if > 9MB"
// This prevents server timeouts while preserving maximum quality for AI accuracy.
const SAFETY_THRESHOLD_BYTES = 9 * 1024 * 1024; // 9 MB Limit
const RESIZE_MAX_DIMENSION = 3840; // 4K Resolution Cap (Only applies if resizing is triggered)
const RESIZE_QUALITY = 0.92; // High quality preservation for resized images

// --- HELPER: EMERGENCY RESIZER (Smart Compress) ---
// Only runs if the file is > 9MB to save the server from crashing.
const smartCompressImage = (base64Str: string, mimeType: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = `data:${mimeType};base64,${base64Str}`;
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // 1. Downscale dimensions only if they are absolutely massive (larger than 4K)
      if (width > RESIZE_MAX_DIMENSION || height > RESIZE_MAX_DIMENSION) {
          const scale = Math.min(RESIZE_MAX_DIMENSION / width, RESIZE_MAX_DIMENSION / height);
          width *= scale;
          height *= scale;
      }

      // Integer Math is critical for Canvas to prevent blurring
      width = Math.floor(width);
      height = Math.floor(height);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) { 
          reject(new Error("Canvas context failed")); 
          return; 
      }

      // 2. White background ensures transparency (PNGs) doesn't turn black
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      
      // 3. Draw image
      ctx.drawImage(img, 0, 0, width, height);
      
      // 4. Export at High Quality
      const resizedDataUrl = canvas.toDataURL('image/jpeg', RESIZE_QUALITY);
      
      // Basic validation
      if (resizedDataUrl.length < 100) {
          reject(new Error("Resizing failed: Output too small"));
          return;
      }

      console.log(`Smart Compression Applied: ${img.width}x${img.height} -> ${width}x${height}`);
      resolve(resizedDataUrl.split(',')[1]);
    };

    img.onerror = (e) => reject(new Error("Failed to load image for resizing"));
  });
};

// --- VIDEO PROCESSING UTILS (The Storyboard Trick) ---
// Extracts 4 frames from a video and stitches them into a 2x2 grid image
const MAX_VIDEO_FRAME_DIM = 800; // Limit video frame size

const videoToStoryboardBase64 = async (videoFile: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    // Wait for metadata to load so we know duration and size
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      // Resize huge video frames for the storyboard
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
      
      width = Math.floor(width);
      height = Math.floor(height);

      // We will capture 4 frames at: 10%, 35%, 60%, 85% of the video
      const timePoints = [duration * 0.1, duration * 0.35, duration * 0.6, duration * 0.85];
      
      const canvas = document.createElement('canvas');
      // Create a 2x2 grid layout
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Helper to capture a single frame
      const captureFrame = (time: number, index: number): Promise<void> => {
        return new Promise((res) => {
          video.currentTime = time;
          // Wait for the seek to complete
          const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            
            // Calculate grid position: (0,0), (1,0), (0,1), (1,1)
            const x = (index % 2) * width;
            const y = Math.floor(index / 2) * height;
            
            ctx.drawImage(video, x, y, width, height);
            res();
          };
          video.addEventListener('seeked', onSeek);
        });
      };

      try {
        // Capture all 4 frames sequentially
        for (let i = 0; i < timePoints.length; i++) {
          await captureFrame(timePoints[i], i);
        }
        
        // Export as JPEG (Compressed to 0.85 quality)
        const base64Url = canvas.toDataURL('image/jpeg', 0.85); 
        
        // Remove the data URL header ("data:image/jpeg;base64,")
        const base64Clean = base64Url.includes(',') ? base64Url.split(',')[1] : base64Url;
        
        resolve(base64Clean);
        
      } catch (e) {
        reject(e);
      } finally {
        // Cleanup memory
        URL.revokeObjectURL(video.src);
        video.remove();
        canvas.remove();
      }
    };

    video.onerror = () => reject(new Error("Failed to load video file"));
  });
};

// --- FILE CONVERSION (Main Entry Point) ---

export const fileToBase64 = async (file: File): Promise<string> => {
  // SPECIAL HANDLER: If Video, convert to Storyboard Image
  if (file.type.startsWith('video/') || file.name.toLowerCase().match(/\.(mp4|mov|avi|webm)$/)) {
      try {
          console.log("Processing video storyboard for AI analysis...");
          return await videoToStoryboardBase64(file);
      } catch (e) {
          console.error("Storyboard generation failed", e);
          throw new Error("Failed to process video frames. File might be corrupt or format unsupported.");
      }
  }

  // STANDARD HANDLER: Images
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const result = reader.result as string;
      const rawBase64 = result.includes(',') ? result.split(',')[1] : result;

      // --- SMART LOGIC ---
      // If file > 9MB, resize it to save the server.
      // If file <= 9MB, send ORIGINAL to ensure AI sees maximum detail.
      if (file.size > SAFETY_THRESHOLD_BYTES) {
          console.warn(`File size ${file.size} > 9MB. Triggering Smart Compression.`);
          try {
              const resized = await smartCompressImage(rawBase64, file.type);
              resolve(resized);
          } catch (e) {
              console.error("Resize failed, falling back to original", e);
              resolve(rawBase64); // Fallback to avoid breaking the flow
          }
      } else {
          // The "Golden Path" - Send original file for max AI accuracy
          console.log(`File size ${file.size} is safe (<9MB). Sending original.`);
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

// --- XMP GENERATION (Encoding-Safe) ---

export const generateXmpPacket = (metadata: StockMetadata, mimeType: string = "image/jpeg"): string => {
  const sanitize = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Note: We use \uFEFF for the BOM (Byte Order Mark) which is critical for XMP
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

// --- FORMAT SPECIFIC INJECTORS ---

// 1. JPEG Injector (EXIF + XMP with Safe Binary Handling)
const embedMetadataInJpeg = async (file: File, metadata: StockMetadata): Promise<Blob> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const jpegDataUrl = e.target?.result as string;
        
        // 1. Embed EXIF using piexifjs
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
        
        // Insert EXIF and get new data URL
        const newJpegWithExif = piexif.insert(exifBytes, jpegDataUrl);

        // 2. Prepare for XMP Injection (Convert to Uint8Array)
        const raw = atob(newJpegWithExif.split(',')[1]);
        const fileBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          fileBytes[i] = raw.charCodeAt(i);
        }

        // 3. Generate XMP Data (Encoded as UTF-8)
        const xmpStr = generateXmpPacket(metadata, "image/jpeg");
        const encoder = new TextEncoder();
        const xmpBytes = encoder.encode(xmpStr);

        // 4. Construct APP1 Segment for XMP
        // Header: http://ns.adobe.com/xap/1.0/ + null terminator
        const headerStr = "http://ns.adobe.com/xap/1.0/\x00";
        const headerBytes = encoder.encode(headerStr); 

        // Calculate lengths
        const payloadLen = headerBytes.length + xmpBytes.length;
        // Marker length = payload + 2 bytes for the length field itself
        const segmentLen = payloadLen + 2;

        const app1Segment = new Uint8Array(2 + 2 + payloadLen);
        let offset = 0;

        // APP1 Marker (FF E1)
        app1Segment[0] = 0xFF;
        app1Segment[1] = 0xE1;
        offset += 2;

        // Length (Big Endian)
        app1Segment[offset++] = (segmentLen >> 8) & 0xFF;
        app1Segment[offset++] = segmentLen & 0xFF;

        // Header
        app1Segment.set(headerBytes, offset);
        offset += headerBytes.length;

        // XMP Payload
        app1Segment.set(xmpBytes, offset);

        // 5. Splice into File (After SOI: FF D8)
        if (fileBytes[0] === 0xFF && fileBytes[1] === 0xD8) {
            const finalBytes = new Uint8Array(fileBytes.length + app1Segment.length);
            
            // Copy SOI (2 bytes)
            finalBytes.set(fileBytes.slice(0, 2), 0);
            
            // Insert XMP APP1
            finalBytes.set(app1Segment, 2);
            
            // Copy rest of the file
            finalBytes.set(fileBytes.slice(2), 2 + app1Segment.length);
            
            resolve(new Blob([finalBytes], { type: "image/jpeg" }));
        } else {
            console.error("Invalid JPEG signature during XMP injection");
            // Fallback to the EXIF-only version if XMP injection fails
            resolve(new Blob([fileBytes], { type: "image/jpeg" }));
        }

      } catch (err) {
        console.error("Error embedding metadata:", err);
        resolve(file); 
      }
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

// 2. SVG Injector (Direct XML)
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

// 3. EPS Injector (PostScript Comments) - BINARY SAFE
const embedMetadataInEps = async (file: File, metadata: StockMetadata): Promise<Blob> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;
                if (!buffer) { resolve(file); return; }

                const data = new Uint8Array(buffer);

                // Helper: findBinarySequence
                const findBinarySequence = (haystack: Uint8Array, pattern: string, limit?: number): number => {
                    const seq = new Uint8Array(pattern.length);
                    for (let i = 0; i < pattern.length; i++) {
                        seq[i] = pattern.charCodeAt(i);
                    }
                    
                    const len = haystack.length;
                    const seqLen = seq.length;
                    const max = limit ? Math.min(len, limit) : len;

                    for (let i = 0; i <= max - seqLen; i++) {
                        let match = true;
                        for (let j = 0; j < seqLen; j++) {
                            if (haystack[i + j] !== seq[j]) {
                                match = false;
                                break;
                            }
                        }
                        if (match) return i;
                    }
                    return -1;
                };

                let insertIndex = -1;

                // 1. Search for %%EndComments
                const endCommentsIndex = findBinarySequence(data, "%%EndComments");
                
                if (endCommentsIndex !== -1) {
                    insertIndex = endCommentsIndex + 13;
                } else {
                    // 2. Fallback: Search for %!PS-Adobe
                    const headerIndex = findBinarySequence(data, "%!PS-Adobe", 1024);
                    if (headerIndex !== -1) {
                         let newlineIndex = -1;
                         const scanLimit = Math.min(data.length, headerIndex + 256);
                         for (let k = headerIndex; k < scanLimit; k++) {
                             if (data[k] === 0x0A || data[k] === 0x0D) {
                                 newlineIndex = k;
                                 break;
                             }
                         }
                         if (newlineIndex !== -1) {
                             if (data[newlineIndex] === 0x0D && newlineIndex + 1 < data.length && data[newlineIndex + 1] === 0x0A) {
                                 insertIndex = newlineIndex + 2;
                             } else {
                                 insertIndex = newlineIndex + 1;
                             }
                         } else {
                             insertIndex = headerIndex + 10; 
                         }
                    } else {
                        insertIndex = 0;
                    }
                }

                // Prepare XMP Payload
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

            } catch (err) {
                console.error("EPS Injection Error:", err);
                resolve(file);
            }
        };

        reader.onerror = () => resolve(file);
        reader.readAsArrayBuffer(file);
    });
};

// 4. PNG Injector (iTXt Chunk)
const embedMetadataInPng = async (file: File, metadata: StockMetadata): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const buffer = e.target?.result as ArrayBuffer;
            if (!buffer) { resolve(file); return; }
            
            const uint8 = new Uint8Array(buffer);
            
            if (uint8[0] !== 0x89 || uint8[1] !== 0x50) {
                resolve(file); 
                return;
            }

            const xmp = generateXmpPacket(metadata, "image/png");
            
            const keyword = "XML:com.adobe.xmp";
            const keywordBytes = new TextEncoder().encode(keyword);
            const xmpBytes = new TextEncoder().encode(xmp);
            
            const dataLen = keywordBytes.length + 1 + 2 + 1 + 1 + xmpBytes.length;
            const chunkData = new Uint8Array(dataLen);
            
            let offset = 0;
            chunkData.set(keywordBytes, offset); offset += keywordBytes.length;
            chunkData[offset++] = 0; 
            chunkData[offset++] = 0; 
            chunkData[offset++] = 0; 
            chunkData[offset++] = 0; 
            chunkData[offset++] = 0; 
            chunkData.set(xmpBytes, offset);
            
            const typeStr = "iTXt";
            const typeBytes = new TextEncoder().encode(typeStr);
            
            const crcBuff = new Uint8Array(typeBytes.length + chunkData.length);
            crcBuff.set(typeBytes, 0);
            crcBuff.set(chunkData, typeBytes.length);
            const crcVal = crc32(crcBuff);
            
            const chunkLen = chunkData.length;
            const fullChunk = new Uint8Array(4 + 4 + chunkLen + 4);
            const view = new DataView(fullChunk.buffer);
            
            view.setUint32(0, chunkLen, false); 
            fullChunk.set(typeBytes, 4);
            fullChunk.set(chunkData, 8);
            view.setUint32(8 + chunkLen, crcVal, false); 
            
            const insertPos = 33; 
            
            const newPngBuffer = new Uint8Array(uint8.length + fullChunk.length);
            newPngBuffer.set(uint8.slice(0, insertPos), 0);
            newPngBuffer.set(fullChunk, insertPos);
            newPngBuffer.set(uint8.slice(insertPos), insertPos + fullChunk.length);
            
            resolve(new Blob([newPngBuffer], { type: "image/png" }));
        };
        reader.onerror = () => resolve(file);
        reader.readAsArrayBuffer(file);
    });
};

// 5. Video Injector (MP4/MOV - ISO BMFF UUID Box)
const embedMetadataInVideo = async (file: File, metadata: StockMetadata): Promise<Blob> => {
    // Generate XMP Packet
    const xmp = generateXmpPacket(metadata, file.type || "video/mp4");
    const encoder = new TextEncoder();
    const xmpBytes = encoder.encode(xmp);
    
    // Adobe XMP UUID: BE7ACFCB-97A9-42E8-9C71-999491E3AFAC
    const uuid = new Uint8Array([
        0xBE, 0x7A, 0xCF, 0xCB, 0x97, 0xA9, 0x42, 0xE8,
        0x9C, 0x71, 0x99, 0x94, 0x91, 0xE3, 0xAF, 0xAC
    ]);

    // Box Structure: [Length (4)] [Type (4)] [ExtendedType (16)] [Data (N)]
    const boxSize = 4 + 4 + 16 + xmpBytes.length;
    const box = new Uint8Array(boxSize);
    const view = new DataView(box.buffer);

    let offset = 0;
    
    // 1. Box Size (Big Endian)
    view.setUint32(offset, boxSize, false); 
    offset += 4;
    
    // 2. Box Type ('uuid')
    box.set(encoder.encode("uuid"), offset);
    offset += 4;

    // 3. Extended Type UUID
    box.set(uuid, offset);
    offset += 16;

    // 4. Data (XMP)
    box.set(xmpBytes, offset);

    // Append the UUID box to the end of the video file.
    // This is valid in ISO BMFF as a top-level box and is read by Adobe apps.
    return new Blob([file, box], { type: file.type });
};

// --- MAIN INJECTION HANDLER ---

export const embedMetadata = async (file: File, metadata: StockMetadata): Promise<Blob> => {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  // Route to specific injector based on MIME or Extension
  if (type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return embedMetadataInJpeg(file, metadata);
  }
  
  if (type === 'image/png' || name.endsWith('.png')) {
      return embedMetadataInPng(file, metadata);
  }
  
  if (type === 'image/svg+xml' || name.endsWith('.svg')) {
      return embedMetadataInSvg(file, metadata);
  }
  
  if (name.endsWith('.eps')) {
      return embedMetadataInEps(file, metadata);
  }

  // New Video Support
  if (type.startsWith('video/') || name.endsWith('.mp4') || name.endsWith('.mov')) {
      return embedMetadataInVideo(file, metadata);
  }

  // Fallback
  return file;
};