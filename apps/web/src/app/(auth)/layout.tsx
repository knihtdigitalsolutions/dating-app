export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-surface-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Atmospheric background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 70% 55% at 15% 20%, oklch(80% 0.15 85 / 6%) 0%, transparent 65%),
          radial-gradient(ellipse 50% 45% at 85% 80%, oklch(60% 0.08 85 / 4%) 0%, transparent 60%)
        `,
      }} />

      {/* Thin horizontal rule — subtle structure */}
      <div style={{
        position: 'absolute', top: '38%', left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, var(--color-border-subtle) 30%, var(--color-border-subtle) 70%, transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
