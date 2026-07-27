'use client'
import React, { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 1. GLSL Vertex Shader: The Math Matrix
const vertexShader = `
  uniform float uProgress; // Scroll progress (0.0 to 1.0)
  uniform float uTime;
  
  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    
    // The starting flat position (Phase 1 data)
    vec3 flatPos = position;
    
    // The apothem radius of the cylinder
    float radius = 300.0; 
    
    // Calculate the wrap (Tangent math)
    float theta = flatPos.x / radius; 
    
    // Map flat X/Z to cylindrical X/Z
    vec3 cylinderPos;
    cylinderPos.x = sin(theta) * radius;
    cylinderPos.y = flatPos.y; 
    cylinderPos.z = cos(theta) * radius - radius; // Offset to hinge at the center

    // Add a tiny bit of noise/drift using uTime so the swarm feels "alive"
    float noise = sin(uTime * 2.0 + flatPos.x * 0.05) * 2.0;
    cylinderPos.y += noise;

    // Linear Interpolation (The Morph)
    vec3 finalPos = mix(flatPos, cylinderPos, uProgress);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    
    // Size attenuation (dots get smaller as they get further away)
    gl_PointSize = 3.5 * (600.0 / -mvPosition.z); 
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 2. GLSL Fragment Shader: Rendering the Dots
const fragmentShader = `
  varying vec3 vColor;

  void main() {
    // Math to crop the square WebGL points into perfect circles
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if(ll > 0.5) discard;
    
    gl_FragColor = vec4(vColor, 0.85); // 85% opacity for that glowing look
  }
`;

// 3. The R3F Component (Phase 2 & 3 Combined)
const MorphingSwarm = forwardRef(({ positions, colors }, ref) => {
  const materialRef = useRef();
  
  // We use useImperativeHandle to let Phase 4 (Scroll) update the uProgress uniform from outside
  useImperativeHandle(ref, () => ({
    setProgress: (val) => {
      if (materialRef.current) {
        materialRef.current.uniforms.uProgress.value = val;
      }
    }
  }));

  // Setup the uniforms
  const uniforms = useMemo(() => ({
    uProgress: { value: 0.0 }, // Starts flat
    uTime: { value: 0.0 }
  }), []);

  // Update the time uniform every frame to keep the noise drifting
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
});

MorphingSwarm.displayName = 'MorphingSwarm';
export default MorphingSwarm;
