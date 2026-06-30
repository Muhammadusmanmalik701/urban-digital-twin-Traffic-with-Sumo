import { useEffect, useRef } from 'react'
import { useLayerStore } from '../../store/layerStore'
import { useRiskStore } from '../../store/riskStore'

// Intensity per risk level — shimmer only visible at Danger+
const RISK_INTENSITY: Record<string, number> = {
  Normal: 0, Caution: 0, Danger: 0.4, Extreme: 0.78, Emergency: 1.0,
}

// GLSL fragment shader — distorts 3D scene pixels at street level (lower viewport)
// czm_frameNumber is Cesium's built-in frame counter
const SHIMMER_SHADER = `
  uniform sampler2D colorTexture;
  uniform float u_intensity;
  in vec2 v_textureCoordinates;

  void main() {
    vec2 uv = v_textureCoordinates;

    // Street factor: strongest at bottom (foreground streets), fades to 0 above horizon
    // smoothstep(edge0, edge1, x): 1 when uv.y < 0.18, 0 when uv.y > 0.72
    float street = smoothstep(0.72, 0.18, uv.y) * u_intensity;

    float t = float(czm_frameNumber) * 0.018;

    // Multi-frequency wavy distortion — horizontal heat shimmer bands
    float dx = (sin(uv.x * 22.0 + t * 2.3)          * 0.006
             +  sin(uv.x * 13.0 + t * 1.6 + 1.9)    * 0.004
             +  cos(uv.x *  8.0 + t * 0.9 + 3.4)    * 0.003
             +  sin(uv.x * 32.0 + t * 3.1 + 0.7)    * 0.0015)
             * street;

    // Vertical shimmer — rising hot air columns
    float dy = (cos(uv.y * 18.0 + t * 1.8 + uv.x * 7.0)  * 0.004
             +  sin(uv.y * 11.0 + t * 2.5 + uv.x * 4.5)  * 0.003
             +  cos(uv.x * 25.0 + t * 2.0 + uv.y * 3.0)  * 0.002)
             * street;

    vec4 color = texture(colorTexture, clamp(uv + vec2(dx, dy), 0.001, 0.999));

    // Subtle orange-gold tint at ground level — heat glow on pavement
    color.rgb += vec3(0.10, 0.030, 0.0) * street * 0.45;

    // Very slight brightness boost at hottest zones (asphalt heat emission)
    float glow = street * 0.06;
    color.rgb = mix(color.rgb, color.rgb + vec3(0.12, 0.06, 0.01), glow);

    out_FragColor = color;
  }
`

export function HeatShimmerLayer({ viewer }: { viewer: any }) {
  const { showHeatWave } = useLayerStore()
  const heat = useRiskStore(s => s.heat)
  const stageRef    = useRef<any>(null)
  const intensityRef = useRef(0)

  // Keep intensityRef in sync so the PostProcessStage callback always reads latest
  useEffect(() => {
    intensityRef.current = RISK_INTENSITY[heat.level] ?? 0
  }, [heat.level])

  useEffect(() => {
    if (!viewer || !showHeatWave) return
    const Cesium = (window as any).Cesium

    const stage = new Cesium.PostProcessStage({
      fragmentShader: SHIMMER_SHADER,
      uniforms: {
        // Callback reads latest intensity on every frame — no React re-render needed
        u_intensity: () => intensityRef.current,
      },
    })

    viewer.scene.postProcessStages.add(stage)
    stageRef.current = stage

    return () => {
      try {
        if (stageRef.current && !stageRef.current.isDestroyed?.()) {
          viewer.scene.postProcessStages.remove(stageRef.current, true)
        }
      } catch { /* ignore if viewer is being destroyed */ }
      stageRef.current = null
    }
  }, [viewer, showHeatWave])

  // Disable stage (but keep it) when layer toggled off
  useEffect(() => {
    if (!stageRef.current) return
    try { stageRef.current.enabled = showHeatWave } catch { /* ignore */ }
  }, [showHeatWave])

  return null  // No DOM output — lives entirely in Cesium's render pipeline
}
