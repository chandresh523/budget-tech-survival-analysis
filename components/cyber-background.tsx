'use client';

export default function CyberBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Deep Void Base */}
      <div className="absolute inset-0 bg-[#03020a]" />
      
      {/* Animated Radial Neon Glow Orbs */}
      <div 
        className="absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-br from-cyan-500/10 via-violet-600/5 to-transparent blur-[120px] animate-pulse" 
        style={{ animationDuration: '8s' }} 
      />
      <div 
        className="absolute top-[40%] -right-[15%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-tl from-violet-600/10 via-cyan-500/5 to-transparent blur-[140px] animate-pulse" 
        style={{ animationDuration: '10s' }} 
      />

      {/* Cyberpunk Grid Lines Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.08]" 
        style={{
          backgroundImage: `linear-gradient(to right, #00c2d1 1px, transparent 1px), linear-gradient(to bottom, #00c2d1 1px, transparent 1px)`,
          backgroundSize: '80px 80px'
        }} 
      />

      {/* Cinematic Vignette Shadow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#03020a_95%)]" />
    </div>
  );
}
