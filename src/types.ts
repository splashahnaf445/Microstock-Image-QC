/**
 * Types and Interfaces for Microstock QC (Image Quality Benchmarking & Compliance)
 */

export interface ReviewResult {
  technical_score: number; // out of 100
  stock_suitability_score: number; // out of 100
  rejection_reasons: string[];
  flags: {
    has_anatomy_issues: boolean;
    has_face_incoherence: boolean;
    has_extra_limbs_or_duplicates: boolean;
    has_text_or_watermarks: boolean;
    has_weird_reflections_or_lighting: boolean;
    has_background_deformities: boolean;
    has_perspective_problems: boolean;
    has_overcooked_hdr_or_oversharpening: boolean;
    has_noise_or_texture_mush: boolean;
    has_logo_or_trademark_risk: boolean;
    has_copy_space_issues: boolean;
  };
  detailed_analysis: {
    anatomy_and_limbs: string;
    face_coherence: string;
    text_and_watermarks: string;
    lighting_and_reflections: string;
    technical_quality: string; // HDR, sharpening, noise, etc.
    ip_risk: string; // Logos, trademarks, brands, etc.
    stock_usability: string; // Composition, copy space, value
    concept_match?: string; // How well it matches the concept, if provided
  };
}

export interface ReviewItem {
  id: string;
  imageName: string;
  imageSize: string;
  previewUrl: string; // Base64 or object URL for preview
  base64Data?: string; // Raw base64 to send to backend
  targetConcept?: string; // Optional target concept/prompt to check match
  status: 'idle' | 'reviewing' | 'success' | 'error';
  result?: ReviewResult;
  error_message?: string;
}

