// Apollo Health brand mark. Wraps the medallion logo image with a circular
// frame so it sits visually consistently next to text — the logo art itself
// is square-cropped against a yellow background, and the round container
// gives it a clean badge feel at small sizes.

type BrandMarkProps = {
  size?: number
  /** Show a thin border around the badge — useful on white surfaces */
  bordered?: boolean
}

export function BrandMark({ size = 28, bordered = false }: BrandMarkProps) {
  return (
    <span
      className={bordered ? 'brand-mark brand-mark-bordered' : 'brand-mark'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img src="/logo-128.png" alt="" width={size} height={size} draggable={false} />
    </span>
  )
}
