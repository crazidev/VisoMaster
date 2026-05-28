import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useAppStore } from '@/store/appStore'
import { useEvents } from '@/hooks/useEvents'
import { useCallback } from 'react'

export interface Param {
  name: string; label: string
  type: 'toggle' | 'slider' | 'decimal_slider' | 'selection'
  default: unknown; options?: string[]
  min?: number; max?: number; step?: number; decimals?: number
  parent?: string; parentValue?: unknown
  scope?: 'control' | 'parameter'  // 'parameter' is default; 'control' routes to global state
}

export const BLOCK_PARAMS: Record<string, Param[]> = {
  'Face Restorer': [
    { name: 'FaceRestorerEnableToggle', label: 'Enable Restorer 1', type: 'toggle', default: false },
    { name: 'FaceRestorerTypeSelection', label: 'Type', type: 'selection', default: 'GFPGAN-v1.4', options: ['GFPGAN-v1.4', 'CodeFormer', 'GPEN-256', 'GPEN-512', 'GPEN-1024', 'GPEN-2048', 'RestoreFormer++', 'VQFR-v2'], parent: 'FaceRestorerEnableToggle', parentValue: true },
    { name: 'FaceRestorerDetTypeSelection', label: 'Alignment', type: 'selection', default: 'Original', options: ['Original', 'Blend', 'Reference'], parent: 'FaceRestorerEnableToggle', parentValue: true },
    { name: 'FaceFidelityWeightDecimalSlider', label: 'Fidelity', type: 'decimal_slider', default: 0.9, min: 0, max: 1, step: 0.1, decimals: 1, parent: 'FaceRestorerEnableToggle', parentValue: true },
    { name: 'FaceRestorerBlendSlider', label: 'Blend', type: 'slider', default: 100, min: 0, max: 100, step: 1, parent: 'FaceRestorerEnableToggle', parentValue: true },
    { name: 'FaceRestorerEnable2Toggle', label: 'Enable Restorer 2', type: 'toggle', default: false },
    { name: 'FaceRestorerType2Selection', label: 'Type 2', type: 'selection', default: 'GFPGAN-v1.4', options: ['GFPGAN-v1.4', 'CodeFormer', 'GPEN-256', 'GPEN-512', 'GPEN-1024', 'GPEN-2048', 'RestoreFormer++', 'VQFR-v2'], parent: 'FaceRestorerEnable2Toggle', parentValue: true },
    { name: 'FaceRestorerBlend2Slider', label: 'Blend 2', type: 'slider', default: 100, min: 0, max: 100, step: 1, parent: 'FaceRestorerEnable2Toggle', parentValue: true },
  ],
  'Face Similarity': [
    { name: 'SimilarityThresholdSlider', label: 'Threshold', type: 'slider', default: 60, min: 1, max: 100, step: 1 },
    { name: 'StrengthEnableToggle', label: 'Strength', type: 'toggle', default: false },
    { name: 'StrengthAmountSlider', label: 'Amount', type: 'slider', default: 100, min: 0, max: 500, step: 25, parent: 'StrengthEnableToggle', parentValue: true },
    { name: 'FaceLikenessEnableToggle', label: 'Face Likeness', type: 'toggle', default: false },
    { name: 'FaceLikenessFactorDecimalSlider', label: 'Likeness', type: 'decimal_slider', default: 0, min: -1, max: 1, step: 0.05, decimals: 2, parent: 'FaceLikenessEnableToggle', parentValue: true },
    { name: 'DifferencingEnableToggle', label: 'Differencing', type: 'toggle', default: false },
    { name: 'DifferencingAmountSlider', label: 'Amount', type: 'slider', default: 4, min: 0, max: 100, step: 1, parent: 'DifferencingEnableToggle', parentValue: true },
  ],
  'Face Mask': [
    { name: 'BorderTopSlider', label: 'Top Border', type: 'slider', default: 10, min: 0, max: 100, step: 1 },
    { name: 'BorderBottomSlider', label: 'Bottom Border', type: 'slider', default: 10, min: 0, max: 100, step: 1 },
    { name: 'BorderLeftSlider', label: 'Left Border', type: 'slider', default: 10, min: 0, max: 100, step: 1 },
    { name: 'BorderRightSlider', label: 'Right Border', type: 'slider', default: 10, min: 0, max: 100, step: 1 },
    { name: 'BorderBlurSlider', label: 'Border Blur', type: 'slider', default: 10, min: 0, max: 100, step: 1 },
    { name: 'OccluderEnableToggle', label: 'Occlusion Mask', type: 'toggle', default: false },
    { name: 'OccluderSizeSlider', label: 'Occluder Size', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'OccluderEnableToggle', parentValue: true },
    { name: 'DFLXSegEnableToggle', label: 'DFL XSeg Mask', type: 'toggle', default: false },
    { name: 'ClipEnableToggle', label: 'Text Masking', type: 'toggle', default: false },
    { name: 'FaceParserEnableToggle', label: 'Face Parser Mask', type: 'toggle', default: false },
    { name: 'RestoreEyesEnableToggle', label: 'Restore Eyes', type: 'toggle', default: false },
    { name: 'RestoreMouthEnableToggle', label: 'Restore Mouth', type: 'toggle', default: false },
  ],
  'Frame Enhancer': [
    { name: 'FrameEnhancerEnableToggle', label: 'Enable', type: 'toggle', default: false },
    { name: 'FrameEnhancerTypeSelection', label: 'Type', type: 'selection', default: 'RealEsrgan-x2-Plus', options: ['RealEsrgan-x2-Plus', 'RealEsrgan-x4-Plus', 'RealEsr-General-x4v3', 'BSRGan-x2', 'BSRGan-x4', 'UltraSharp-x4', 'UltraMix-x4', 'DDColor-Artistic', 'DDColor', 'DeOldify-Artistic', 'DeOldify-Stable', 'DeOldify-Video'], parent: 'FrameEnhancerEnableToggle', parentValue: true },
    { name: 'FrameEnhancerBlendSlider', label: 'Blend', type: 'slider', default: 100, min: 0, max: 100, step: 1, parent: 'FrameEnhancerEnableToggle', parentValue: true },
  ],
  'Detection': [
    { name: 'DetectorScoreSlider', label: 'Score', type: 'slider', default: 50, min: 1, max: 100, step: 1, scope: 'control' },
    { name: 'AutoRotationToggle', label: 'Auto Rotation', type: 'toggle', default: false, scope: 'control' },
    { name: 'ShowAllDetectedFacesBBoxToggle', label: 'Show Bounding Boxes', type: 'toggle', default: false, scope: 'control' },
    // Landmark section — rendered by DetectionBlock, not the generic renderer
    { name: 'ShowLandmarksEnableToggle', label: 'Show Landmarks', type: 'toggle', default: false, scope: 'control' },
    { name: 'LandmarkDetectToggle', label: 'Landmark Detect', type: 'toggle', default: false, scope: 'control', parent: 'ShowLandmarksEnableToggle', parentValue: true },
    { name: 'LandmarkDetectModelSelection', label: 'Model', type: 'selection', default: '5', options: ['5', '68', '3d68', '98', '106', '203', '478'], scope: 'control', parent: 'LandmarkDetectToggle', parentValue: true },
    { name: 'LandmarkDetectScoreSlider', label: 'Score', type: 'slider', default: 50, min: 1, max: 100, step: 1, scope: 'control', parent: 'LandmarkDetectToggle', parentValue: true },
    { name: 'DetectFromPointsToggle', label: 'Detect From Points', type: 'toggle', default: false, scope: 'control', parent: 'LandmarkDetectToggle', parentValue: true },
  ],
  'Swapper': [
    { name: 'SwapModelSelection', label: 'Swapper Model', type: 'selection', default: 'Inswapper128',
      options: ['Inswapper128', 'InStyleSwapper256 Version A', 'InStyleSwapper256 Version B', 'InStyleSwapper256 Version C', 'DeepFaceLive (DFM)', 'SimSwap512', 'GhostFace-v1', 'GhostFace-v2', 'GhostFace-v3', 'CSCS'] },
    // Inswapper128-only: resolution
    { name: 'SwapperResSelection', label: 'Resolution', type: 'selection', default: '128',
      options: ['128', '256', '384', '512'],
      parent: 'SwapModelSelection', parentValue: 'Inswapper128' },
    // DFM-only controls
    { name: 'DFMAmpMorphSlider', label: 'AMP Morph Factor', type: 'slider', default: 50, min: 1, max: 100, step: 1,
      parent: 'SwapModelSelection', parentValue: 'DeepFaceLive (DFM)' },
    { name: 'DFMRCTColorToggle', label: 'RCT Color Transfer', type: 'toggle', default: false,
      parent: 'SwapModelSelection', parentValue: 'DeepFaceLive (DFM)' },
  ],
  'Color Correction': [
    // ── Auto Color Transfer ──────────────────────────────────────────────
    { name: 'AutoColorEnableToggle', label: 'Auto Color Transfer', type: 'toggle', default: false },
    { name: 'AutoColorTransferTypeSelection', label: 'Transfer Type', type: 'selection', default: 'Test', options: ['Test', 'Test_Mask', 'DFL_Test', 'DFL_Orig'], parent: 'AutoColorEnableToggle', parentValue: true },
    { name: 'AutoColorBlendAmountSlider', label: 'Blend Amount', type: 'slider', default: 80, min: 0, max: 100, step: 5, parent: 'AutoColorEnableToggle', parentValue: true },
    // ── Color Adjustments ────────────────────────────────────────────────
    { name: 'ColorEnableToggle', label: 'Color Adjustments', type: 'toggle', default: false },
    { name: 'ColorRedSlider', label: 'Red', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorGreenSlider', label: 'Green', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorBlueSlider', label: 'Blue', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorBrightnessDecimalSlider', label: 'Brightness', type: 'decimal_slider', default: 1.0, min: 0, max: 2, step: 0.01, decimals: 2, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorContrastDecimalSlider', label: 'Contrast', type: 'decimal_slider', default: 1.0, min: 0, max: 2, step: 0.01, decimals: 2, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorSaturationDecimalSlider', label: 'Saturation', type: 'decimal_slider', default: 1.0, min: 0, max: 2, step: 0.01, decimals: 2, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorSharpnessDecimalSlider', label: 'Sharpness', type: 'decimal_slider', default: 1.0, min: 0, max: 2, step: 0.1, decimals: 1, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorHueDecimalSlider', label: 'Hue', type: 'decimal_slider', default: 0.0, min: -0.5, max: 0.5, step: 0.01, decimals: 2, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorGammaDecimalSlider', label: 'Gamma', type: 'decimal_slider', default: 1.0, min: 0, max: 2, step: 0.01, decimals: 2, parent: 'ColorEnableToggle', parentValue: true },
    { name: 'ColorNoiseDecimalSlider', label: 'Noise', type: 'decimal_slider', default: 0.0, min: 0, max: 20, step: 0.5, decimals: 1, parent: 'ColorEnableToggle', parentValue: true },
    // ── JPEG Compression ─────────────────────────────────────────────────
    { name: 'JPEGCompressionEnableToggle', label: 'JPEG Compression', type: 'toggle', default: false },
    { name: 'JPEGCompressionAmountSlider', label: 'Compression', type: 'slider', default: 50, min: 1, max: 100, step: 1, parent: 'JPEGCompressionEnableToggle', parentValue: true },
  ],
  'Expression Restorer': [
    { name: 'FaceExpressionEnableToggle', label: 'Enable', type: 'toggle', default: false },
    { name: 'FaceExpressionFriendlyFactorDecimalSlider', label: 'Friendly Factor', type: 'decimal_slider', default: 1.0, min: 0, max: 1, step: 0.1, decimals: 1, parent: 'FaceExpressionEnableToggle', parentValue: true },
    { name: 'FaceExpressionAnimationRegionSelection', label: 'Region', type: 'selection', default: 'all', options: ['all', 'eyes', 'lips'], parent: 'FaceExpressionEnableToggle', parentValue: true },
  ],
  'Face Editor': [
    { name: 'FaceEditorEnableToggle', label: 'Enable', type: 'toggle', default: false },
    { name: 'HeadPitchSlider', label: 'Head Pitch', type: 'slider', default: 0, min: -15, max: 15, step: 1, parent: 'FaceEditorEnableToggle', parentValue: true },
    { name: 'HeadYawSlider', label: 'Head Yaw', type: 'slider', default: 0, min: -15, max: 15, step: 1, parent: 'FaceEditorEnableToggle', parentValue: true },
    { name: 'HeadRollSlider', label: 'Head Roll', type: 'slider', default: 0, min: -15, max: 15, step: 1, parent: 'FaceEditorEnableToggle', parentValue: true },
    { name: 'EyesOpenRatioDecimalSlider', label: 'Eyes Open', type: 'decimal_slider', default: 0, min: -0.8, max: 0.8, step: 0.01, decimals: 2, parent: 'FaceEditorEnableToggle', parentValue: true },
    { name: 'LipsOpenRatioDecimalSlider', label: 'Lips Open', type: 'decimal_slider', default: 0, min: -0.8, max: 0.8, step: 0.01, decimals: 2, parent: 'FaceEditorEnableToggle', parentValue: true },
    { name: 'MouthSmileDecimalSlider', label: 'Smile', type: 'decimal_slider', default: 0, min: -0.3, max: 1.3, step: 0.01, decimals: 2, parent: 'FaceEditorEnableToggle', parentValue: true },
  ],
  'Landmarks Correction': [
    { name: 'FaceAdjEnableToggle', label: 'Face Adjustments', type: 'toggle', default: false },
    { name: 'KpsXSlider', label: 'Keypoints X', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'FaceAdjEnableToggle', parentValue: true },
    { name: 'KpsYSlider', label: 'Keypoints Y', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'FaceAdjEnableToggle', parentValue: true },
    { name: 'KpsScaleSlider', label: 'Keypoints Scale', type: 'slider', default: 0, min: -100, max: 100, step: 1, parent: 'FaceAdjEnableToggle', parentValue: true },
    { name: 'FaceScaleAmountSlider', label: 'Face Scale', type: 'slider', default: 0, min: -20, max: 20, step: 1, parent: 'FaceAdjEnableToggle', parentValue: true },
  ],
}

function Widget({ param, value, onChange }: {
  param: Param
  value: unknown
  onChange: (v: unknown) => void
}) {
  const v = value ?? param.default

  if (param.type === 'toggle') {
    return (
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-muted-foreground">{param.label}</span>
        <Switch checked={!!v} onCheckedChange={onChange} className="scale-75" />
      </div>
    )
  }

  if (param.type === 'selection') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-xs text-muted-foreground w-24 shrink-0">{param.label}</span>
        <Select value={v as string} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>{param.options?.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    )
  }

  if (param.type === 'slider' || param.type === 'decimal_slider') {
    const numVal = Number(v)
    return (
      <div className="py-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">{param.label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {param.decimals ? numVal.toFixed(param.decimals) : numVal}
          </span>
        </div>
        <Slider
          min={param.min} max={param.max} step={param.step}
          value={[numVal]}
          onValueChange={([v]) => onChange(param.decimals ? parseFloat(v.toFixed(param.decimals)) : Math.round(v))}
          className="w-full"
        />
      </div>
    )
  }
  return null
}

// ─── Custom renderer for the Detection block ──────────────────────────────────
// Splits into two visual sections:
//   1. Detection — Score, Auto Rotation, Bounding Boxes
//   2. Landmarks — Show Landmarks toggle; when ON: Landmark Detect toggle + its sub-controls
function DetectionBlock({ onChange }: { onChange: (name: string, value: unknown, scope?: 'control' | 'parameter') => void }) {
  const { control } = useAppStore()
  const c = control as Record<string, unknown>

  const showLandmarks  = !!c['ShowLandmarksEnableToggle']
  const landmarkDetect = !!c['LandmarkDetectToggle']

  return (
    <div className="flex flex-col">
      {/* ── Detection section ── */}
      <div className="flex flex-col divide-y divide-border/50">
        <Widget
          param={{ name: 'DetectorScoreSlider', label: 'Score', type: 'slider', default: 50, min: 1, max: 100, step: 1, scope: 'control' }}
          value={c['DetectorScoreSlider']}
          onChange={v => onChange('DetectorScoreSlider', v, 'control')}
        />
        <Widget
          param={{ name: 'AutoRotationToggle', label: 'Auto Rotation', type: 'toggle', default: false, scope: 'control' }}
          value={c['AutoRotationToggle']}
          onChange={v => onChange('AutoRotationToggle', v, 'control')}
        />
        <Widget
          param={{ name: 'ShowAllDetectedFacesBBoxToggle', label: 'Show Bounding Boxes', type: 'toggle', default: false, scope: 'control' }}
          value={c['ShowAllDetectedFacesBBoxToggle']}
          onChange={v => onChange('ShowAllDetectedFacesBBoxToggle', v, 'control')}
        />
      </div>

      {/* ── Landmarks section ── */}
      <div className="mt-3 pt-2 border-t border-border">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5 select-none">
          Landmarks
        </p>
        <div className="flex flex-col divide-y divide-border/50">
          {/* Show Landmarks toggle */}
          <Widget
            param={{ name: 'ShowLandmarksEnableToggle', label: 'Show Landmarks', type: 'toggle', default: false, scope: 'control' }}
            value={c['ShowLandmarksEnableToggle']}
            onChange={v => onChange('ShowLandmarksEnableToggle', v, 'control')}
          />

          {/* Only visible when Show Landmarks is ON */}
          {showLandmarks && (
            <>
              {/* Landmark Detect toggle */}
              <Widget
                param={{ name: 'LandmarkDetectToggle', label: 'Landmark Detect', type: 'toggle', default: false, scope: 'control' }}
                value={c['LandmarkDetectToggle']}
                onChange={v => onChange('LandmarkDetectToggle', v, 'control')}
              />

              {/* Sub-controls — only when Landmark Detect is also ON */}
              {landmarkDetect && (
                <div className="pl-3 border-l-2 border-primary/30 ml-1 flex flex-col divide-y divide-border/50">
                  <Widget
                    param={{ name: 'LandmarkDetectModelSelection', label: 'Model', type: 'selection', default: '5', options: ['5', '68', '3d68', '98', '106', '203', '478'], scope: 'control' }}
                    value={c['LandmarkDetectModelSelection']}
                    onChange={v => onChange('LandmarkDetectModelSelection', v, 'control')}
                  />
                  <Widget
                    param={{ name: 'LandmarkDetectScoreSlider', label: 'Score', type: 'slider', default: 50, min: 1, max: 100, step: 1, scope: 'control' }}
                    value={c['LandmarkDetectScoreSlider']}
                    onChange={v => onChange('LandmarkDetectScoreSlider', v, 'control')}
                  />
                  <Widget
                    param={{ name: 'DetectFromPointsToggle', label: 'Detect From Points', type: 'toggle', default: false, scope: 'control' }}
                    value={c['DetectFromPointsToggle']}
                    onChange={v => onChange('DetectFromPointsToggle', v, 'control')}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ParameterBlock({ blockName }: { blockName: string }) {
  const { selectedFaceId, parameters, updateFaceParameter, control, setControl } = useAppStore()
  const { send } = useEvents()
  const params = BLOCK_PARAMS[blockName] ?? []
  const faceParams = selectedFaceId ? (parameters[selectedFaceId] ?? {}) : {}

  const handleChange = useCallback((name: string, value: unknown, scope?: 'control' | 'parameter') => {
    if (scope === 'control') {
      setControl({ [name]: value })
    } else {
      if (!selectedFaceId) return
      updateFaceParameter(selectedFaceId, name, value)
    }
    if (scope === 'control') {
      send('set_control', { name, value })
    } else {
      if (!selectedFaceId) return
      send('set_parameter', { face_id: selectedFaceId, name, value })
    }
  }, [selectedFaceId, setControl, updateFaceParameter, send])

  // Detection block has its own custom layout
  if (blockName === 'Detection') {
    return <DetectionBlock onChange={handleChange} />
  }

  return (
    <div className="flex flex-col divide-y divide-border/50">
      {params.map(p => {
        const paramSource = p.scope === 'control' ? control : faceParams
        if (p.parent) {
          const parentParam = BLOCK_PARAMS[blockName]?.find(x => x.name === p.parent)
          const parentSource = parentParam?.scope === 'control' ? control : faceParams
          const parentVal = parentSource[p.parent] ?? parentParam?.default
          if (parentVal !== p.parentValue) return null
        }
        return (
          <Widget
            key={p.name}
            param={p}
            value={paramSource[p.name]}
            onChange={v => handleChange(p.name, v, p.scope)}
          />
        )
      })}
      {params.length === 0 && <p className="text-xs text-muted-foreground py-2">No parameters</p>}
    </div>
  )
}
