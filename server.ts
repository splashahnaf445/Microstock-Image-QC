import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// In-memory cache for duplicate image reviews to drastically reduce API quota usage
const reviewCache = new Map<string, any>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 image reviews
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Lazy initialize Gemini AI client
  function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please add it via the Settings > Secrets panel in AI Studio.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  // --- API Routes ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Layer B: Benchmark/Review Image Endpoint
  app.post("/api/review-image", async (req, res) => {
    try {
      const ai = getGeminiClient();
      const { base64Data, mimeType, imageName, targetConcept, model } = req.body;

      if (!base64Data || !mimeType) {
        return res.status(400).json({ error: "Missing image data or mimeType." });
      }

      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

      // Calculate a unique fingerprint/key from image data, model selection, and prompt parameters to hit cache
      const cacheKey = `${cleanBase64.substring(0, 300)}_${cleanBase64.length}_${targetConcept || ""}_${model || "gemini-3.5-flash"}`;
      if (reviewCache.has(cacheKey)) {
        console.log(`[Cache Hit] Serving cached compliance result for: ${imageName || "unnamed"}`);
        return res.json(reviewCache.get(cacheKey));
      }

      const imagePart = {
        inlineData: {
          mimeType,
          data: cleanBase64,
        }
      };

      const systemInstruction = `You are an elite Quality Inspector and Compliance Reviewer for Adobe Stock and other premium microstock platforms.
Your role is to strictly analyze submitted images and benchmark them against rigorous professional agency guidelines.
You will assess:
- Anatomy, hands, fingers (check for malformations, extra limbs, creepy duplicates)
- Face coherence, gaze direction, mouth deformities
- Text artifacts, spelling-like garbage, watermarks, signature-like curves
- Lighting defects (overexposure, shadow clippings, unnatural highlights, overcooked HDR, halos)
- Technical quality (noise, texture mush, blurriness, sensor dust)
- IP/Trademark risks (recognizable logos, products, design furniture, building releases)
- Composition & copy space cleanliness
- Closeness to the target concept (if provided)

Rate the image technical execution (0-100) and commercial/stock suitability (0-100).
Provide clean, concise feedback explaining specific problems, and list official refusal reasons if applicable.`;

      const promptText = `Analyze this image "${imageName || "uploaded_image"}" for microstock commercial licensing viability.
${targetConcept ? `The image was generated to match this target concept or prompt: "${targetConcept}". Analyze if the visual matches this concept.` : "Analyze its overall commercial value."}

You must return a structured JSON response matching this schema:
{
  "technical_score": number, // out of 100
  "stock_suitability_score": number, // out of 100
  "rejection_reasons": ["string"], // specific agency refusal reasons if scores are low or critical issues are found, otherwise empty array []
  "flags": {
    "has_anatomy_issues": boolean,
    "has_face_incoherence": boolean,
    "has_extra_limbs_or_duplicates": boolean,
    "has_text_or_watermarks": boolean,
    "has_weird_reflections_or_lighting": boolean,
    "has_background_deformities": boolean,
    "has_perspective_problems": boolean,
    "has_overcooked_hdr_or_oversharpening": boolean,
    "has_noise_or_texture_mush": boolean,
    "has_logo_or_trademark_risk": boolean,
    "has_copy_space_issues": boolean
  },
  "detailed_analysis": {
    "anatomy_and_limbs": "string", // detailed check of limbs/fingers/positions
    "face_coherence": "string", // detailed check of facial symmetry and coherence
    "text_and_watermarks": "string", // evaluation of text, fonts, branding or logos
    "lighting_and_reflections": "string", // evaluation of shadows, highlight clipping, exposures
    "technical_quality": "string", // evaluation of sharpness, halos, noise, texture quality
    "ip_risk": "string", // evaluation of commercial design risk (logos, trademarks)
    "stock_usability": "string", // evaluation of stock utility, copy space, aesthetic appeal
    "concept_match": "string" // assessment of concept match
  }
}`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          technical_score: { type: Type.INTEGER },
          stock_suitability_score: { type: Type.INTEGER },
          rejection_reasons: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          flags: {
            type: Type.OBJECT,
            properties: {
              has_anatomy_issues: { type: Type.BOOLEAN },
              has_face_incoherence: { type: Type.BOOLEAN },
              has_extra_limbs_or_duplicates: { type: Type.BOOLEAN },
              has_text_or_watermarks: { type: Type.BOOLEAN },
              has_weird_reflections_or_lighting: { type: Type.BOOLEAN },
              has_background_deformities: { type: Type.BOOLEAN },
              has_perspective_problems: { type: Type.BOOLEAN },
              has_overcooked_hdr_or_oversharpening: { type: Type.BOOLEAN },
              has_noise_or_texture_mush: { type: Type.BOOLEAN },
              has_logo_or_trademark_risk: { type: Type.BOOLEAN },
              has_copy_space_issues: { type: Type.BOOLEAN }
            },
            required: [
              "has_anatomy_issues", "has_face_incoherence", "has_extra_limbs_or_duplicates",
              "has_text_or_watermarks", "has_weird_reflections_or_lighting", "has_background_deformities",
              "has_perspective_problems", "has_overcooked_hdr_or_oversharpening", "has_noise_or_texture_mush",
              "has_logo_or_trademark_risk", "has_copy_space_issues"
            ]
          },
          detailed_analysis: {
            type: Type.OBJECT,
            properties: {
              anatomy_and_limbs: { type: Type.STRING },
              face_coherence: { type: Type.STRING },
              text_and_watermarks: { type: Type.STRING },
              lighting_and_reflections: { type: Type.STRING },
              technical_quality: { type: Type.STRING },
              ip_risk: { type: Type.STRING },
              stock_usability: { type: Type.STRING },
              concept_match: { type: Type.STRING }
            },
            required: [
              "anatomy_and_limbs", "face_coherence", "text_and_watermarks", "lighting_and_reflections",
              "technical_quality", "ip_risk", "stock_usability", "concept_match"
            ]
          }
        },
        required: ["technical_score", "stock_suitability_score", "rejection_reasons", "flags", "detailed_analysis"]
      };

      console.log(`[Gemini API] Requesting review for image: ${imageName || "unnamed"}`);
      
      let response;
      let responseText = "";
      let attempts = 0;
      const maxAttempts = 5;

      // Construct retry list based on user-selected model
      const requestedModel = model || "gemini-3.5-flash-lite";
      
      let fallbackChain = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-pro", "gemini-2.5-flash", "gemini-1.5-flash"];
      if (requestedModel === "gemini-3.6-flash") {
        fallbackChain = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro", "gemini-2.5-flash", "gemini-1.5-flash"];
      } else if (requestedModel === "gemini-3.1-pro") {
        fallbackChain = ["gemini-3.1-pro", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];
      } else if (requestedModel === "gemini-3.5-flash-lite") {
        fallbackChain = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-pro", "gemini-2.5-flash", "gemini-1.5-flash"];
      } else {
        fallbackChain = [requestedModel, "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash"];
      }

      const modelsToTry = fallbackChain;

      while (attempts < maxAttempts) {
        try {
          const currentModel = modelsToTry[attempts % modelsToTry.length];
          console.log(`[Gemini API] Attempt ${attempts + 1}/${maxAttempts} using model: ${currentModel}`);
          
          const result = await ai.models.generateContent({
            model: currentModel,
            contents: {
              parts: [imagePart, { text: promptText }]
            },
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema
            }
          });
          
          if (result && result.text) {
            responseText = result.text;
            break; // Succeeded! Break out of retry loop.
          } else {
            throw new Error("Empty analysis response from Gemini.");
          }
        } catch (error: any) {
          attempts++;
          const errStr = String(error.message || error.stack || error);
          console.warn(`[Gemini API] Attempt ${attempts} failed with error:`, error.message || error);

          const isQuotaError = errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota");
          const isTransientError = errStr.includes("503") || errStr.includes("UNAVAILABLE") || errStr.includes("demand") || errStr.includes("temporary") || errStr.includes("502") || errStr.includes("504") || errStr.includes("overloaded");
          
          if (isQuotaError && attempts < maxAttempts) {
            // Extract retry seconds from error
            let retrySeconds = 35; // Default cooldown
            try {
              // Parse RetryInfo from JSON error payload if present
              const jsonStart = errStr.indexOf('{');
              if (jsonStart !== -1) {
                const jsonEnd = errStr.lastIndexOf('}');
                if (jsonEnd !== -1 && jsonEnd > jsonStart) {
                  const jsonStr = errStr.substring(jsonStart, jsonEnd + 1);
                  const parsedErr = JSON.parse(jsonStr);
                  const details = parsedErr?.error?.details || parsedErr?.details;
                  if (Array.isArray(details)) {
                    const retryInfo = details.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' || d.retryDelay);
                    if (retryInfo && retryInfo.retryDelay) {
                      const val = parseInt(retryInfo.retryDelay, 10);
                      if (!isNaN(val)) retrySeconds = val;
                    }
                  }
                }
              }
            } catch (_) {}

            // Regex fallback
            try {
              const match = errStr.match(/retry in ([\d\.]+)s/i);
              if (match && match[1]) {
                const val = Math.ceil(parseFloat(match[1]));
                if (!isNaN(val)) retrySeconds = val;
              } else {
                const delayMatch = errStr.match(/"retryDelay":\s*"(\d+)s"/i);
                if (delayMatch && delayMatch[1]) {
                  const val = parseInt(delayMatch[1], 10);
                  if (!isNaN(val)) retrySeconds = val;
                }
              }
            } catch (_) {}

            if (retrySeconds < 10) retrySeconds = 25;
            if (retrySeconds > 60) retrySeconds = 45;

            // Wait exactly retryDelay + 2 seconds for safety
            const finalWaitSec = retrySeconds + 2;
            console.log(`[Gemini API] 429 Quota Exceeded. Sleeping server-side script for ${finalWaitSec}s before retrying...`);
            await new Promise(resolve => setTimeout(resolve, finalWaitSec * 1000));
          } else {
            // Re-throw if out of attempts
            if (attempts >= maxAttempts) {
              throw error;
            }
            
            // For 503 / High Demand and other transient service issues, perform an exponential retry delay
            if (isTransientError) {
              const finalWaitSec = attempts * 3; // 3s, 6s, 9s, 12s
              console.log(`[Gemini API] 503/Transient High Demand. Sleeping server-side script for ${finalWaitSec}s before retrying...`);
              await new Promise(resolve => setTimeout(resolve, finalWaitSec * 1000));
            } else {
              // General quick cooldown for non-descript errors
              console.log(`[Gemini API] Unknown error encountered. Sleeping server-side script for 2s before retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
      }

      if (!responseText) {
        throw new Error("Failed to receive a valid response from Gemini after all retry attempts.");
      }

      const parsed = JSON.parse(responseText.trim());
      reviewCache.set(cacheKey, parsed);
      return res.json(parsed);
    } catch (error: any) {
      console.error("Error reviewing image:", error);
      
      const errStr = String(error.message || error.stack || error);
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota")) {
        // Extract retry delay from the error message if possible
        let retrySeconds = 35; // 35 seconds is a highly reliable default cooldown for free tier RPM
        try {
          // Check for JSON-embedded RetryInfo details
          const jsonStart = errStr.indexOf('{');
          if (jsonStart !== -1) {
            const jsonEnd = errStr.lastIndexOf('}');
            if (jsonEnd !== -1 && jsonEnd > jsonStart) {
              const jsonStr = errStr.substring(jsonStart, jsonEnd + 1);
              const parsedErr = JSON.parse(jsonStr);
              const details = parsedErr?.error?.details || parsedErr?.details;
              if (Array.isArray(details)) {
                const retryInfo = details.find((d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' || d.retryDelay);
                if (retryInfo && retryInfo.retryDelay) {
                  const val = parseInt(retryInfo.retryDelay, 10);
                  if (!isNaN(val)) retrySeconds = val;
                }
              }
            }
          }
        } catch (_) {}

        // Fallback to regex checks
        try {
          const match = errStr.match(/retry in ([\d\.]+)s/i);
          if (match && match[1]) {
            const val = Math.ceil(parseFloat(match[1]));
            if (!isNaN(val)) retrySeconds = val;
          } else {
            const delayMatch = errStr.match(/"retryDelay":\s*"(\d+)s"/i);
            if (delayMatch && delayMatch[1]) {
              const val = parseInt(delayMatch[1], 10);
              if (!isNaN(val)) retrySeconds = val;
            }
          }
        } catch (_) {}

        // Enforce safe minimum and maximum bounds for cooldown
        if (retrySeconds < 10) {
          retrySeconds = 25;
        } else if (retrySeconds > 60) {
          retrySeconds = 45;
        }

        return res.status(429).json({
          error: `Gemini API Quota Exceeded (429). The free-tier has a limit of 20 requests per minute. Please wait ${retrySeconds} seconds before trying again.`,
          retryInSeconds: retrySeconds
        });
      }

      return res.status(500).json({ error: error.message || "Failed to review the image." });
    }
  });


  // --- Vite & Production Static Files ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve index.html for all non-API paths
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
