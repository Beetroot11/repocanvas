export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="rc-logo" aria-hidden="true" data-compact={compact || undefined}>
      <span className="rc-logo__ring" />
      <span className="rc-logo__needle" />
    </span>
  )
}

