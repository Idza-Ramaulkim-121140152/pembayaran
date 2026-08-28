import React, { Component, Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Grid, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

class SceneErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback ?? null;
        }

        return this.props.children;
    }
}

function CameraDrift() {
    const { camera, pointer } = useThree();

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        const targetX = pointer.x * 0.6;
        const targetY = pointer.y * 0.35;

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.025);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY + Math.sin(t * 0.12) * 0.12, 0.025);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, 12 + Math.sin(t * 0.2) * 0.12, 0.02);
        camera.lookAt(0, 0, 0);
    });

    return null;
}

function ParticleField() {
    const positions = useMemo(() => {
        const data = new Float32Array(1800);

        for (let i = 0; i < data.length; i += 3) {
            data[i] = (Math.random() - 0.5) * 34;
            data[i + 1] = (Math.random() - 0.5) * 18;
            data[i + 2] = (Math.random() - 0.5) * 18;
        }

        return data;
    }, []);

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={positions.length / 3}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                color="#60a5fa"
                size={0.045}
                transparent
                opacity={0.8}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}

function SignalCore() {
    const shellRef = useRef(null);
    const ringRef = useRef(null);
    const haloRef = useRef(null);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        if (shellRef.current) {
            shellRef.current.rotation.y = t * 0.22;
            shellRef.current.rotation.x = Math.sin(t * 0.16) * 0.18;
        }

        if (ringRef.current) {
            ringRef.current.rotation.z = -t * 0.28;
            ringRef.current.rotation.x = Math.cos(t * 0.22) * 0.2;
        }

        if (haloRef.current) {
            const scale = 1 + Math.sin(t * 1.4) * 0.08;
            haloRef.current.scale.setScalar(scale);
        }
    });

    return (
        <group position={[0, 1.2, 0]}>
            <mesh ref={haloRef}>
                <sphereGeometry args={[1.45, 48, 48]} />
                <meshBasicMaterial color="#1d4ed8" wireframe transparent opacity={0.08} />
            </mesh>
            <mesh ref={shellRef}>
                <icosahedronGeometry args={[1.15, 1]} />
                <meshStandardMaterial
                    color="#38bdf8"
                    emissive="#0f172a"
                    emissiveIntensity={0.5}
                    metalness={0.35}
                    roughness={0.18}
                    transparent
                    opacity={0.95}
                />
            </mesh>
            <mesh ref={ringRef} rotation={[Math.PI / 2.3, 0, 0]}>
                <torusGeometry args={[2.25, 0.04, 16, 180]} />
                <meshBasicMaterial color="#22d3ee" transparent opacity={0.78} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[2.75, 2.79, 128]} />
                <meshBasicMaterial color="#a855f7" transparent opacity={0.42} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

function FloatingCluster({ position, color, accent, speed = 1, size = 1 }) {
    const clusterRef = useRef(null);

    useFrame((state) => {
        if (!clusterRef.current) return;

        const t = state.clock.getElapsedTime() * speed;
        clusterRef.current.rotation.x = Math.sin(t * 0.6) * 0.28;
        clusterRef.current.rotation.y = Math.cos(t * 0.4) * 0.4;
    });

    return (
        <Float speed={speed * 0.8} rotationIntensity={0.22} floatIntensity={0.75}>
            <group ref={clusterRef} position={position} scale={size}>
                <mesh>
                    <boxGeometry args={[1.25, 0.16, 1.25]} />
                    <meshStandardMaterial color={color} emissive={accent} emissiveIntensity={0.55} metalness={0.85} roughness={0.18} />
                </mesh>
                <mesh position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.28, 0.54, 48]} />
                    <meshBasicMaterial color={accent} transparent opacity={0.75} side={THREE.DoubleSide} />
                </mesh>
                <mesh position={[0, 0.38, 0]}>
                    <boxGeometry args={[0.28, 0.28, 0.28]} />
                    <meshStandardMaterial color="#e2e8f0" emissive={accent} emissiveIntensity={0.85} metalness={0.65} roughness={0.12} />
                </mesh>
            </group>
        </Float>
    );
}

function SceneContent() {
    return (
        <>
            <CameraDrift />
            <fog attach="fog" args={['#020617', 8, 28]} />
            <color attach="background" args={['#020617']} />

            <ambientLight intensity={0.8} color="#93c5fd" />
            <directionalLight position={[5, 10, 6]} intensity={2.1} color="#67e8f9" />
            <pointLight position={[-8, -1, 6]} intensity={1.2} color="#a855f7" />
            <pointLight position={[7, 2, 10]} intensity={1.4} color="#0ea5e9" />

            <Grid
                position={[0, -3.5, 0]}
                args={[40, 20]}
                cellSize={0.85}
                cellThickness={0.5}
                cellColor="#0f3b68"
                sectionSize={4}
                sectionThickness={1.25}
                sectionColor="#1d4ed8"
                fadeDistance={34}
                fadeStrength={1}
                infiniteGrid
            />

            <ParticleField />
            <Sparkles count={120} scale={[28, 14, 18]} size={2.8} speed={0.3} color="#38bdf8" opacity={0.35} />

            <SignalCore />
            <FloatingCluster position={[-5.8, 2.2, -3]} color="#0f766e" accent="#22d3ee" speed={0.8} size={1.05} />
            <FloatingCluster position={[5.4, -0.1, -2.4]} color="#581c87" accent="#c084fc" speed={1.05} size={0.95} />
            <FloatingCluster position={[2.8, 3.5, -4.6]} color="#172554" accent="#60a5fa" speed={0.7} size={0.75} />
            <FloatingCluster position={[-2.5, -0.7, -5.2]} color="#3f6212" accent="#4ade80" speed={0.94} size={0.7} />
        </>
    );
}

export default function CommandCenterScene() {
    const fallback = (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_80%_15%,rgba(168,85,247,0.14),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.12),transparent_34%)]" />
    );

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.4),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.62)_75%,rgba(2,6,23,0.9)_100%)]" />
            <SceneErrorBoundary fallback={fallback}>
                <Canvas
                    dpr={[1, 1.6]}
                    camera={{ position: [0, 0, 12], fov: 45 }}
                    gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
                >
                    <Suspense fallback={null}>
                        <SceneContent />
                    </Suspense>
                </Canvas>
            </SceneErrorBoundary>
        </div>
    );
}
