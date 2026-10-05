import logoUrl from '../assets/surjit-finance-logo.webp'
import { brand } from '../content/siteContent'

// 480 × 75 WebP (≈11 KB), generated from the supplied 2048 × 319 master. The
// logo is shown 28–34 px tall (≈180–220 px wide), so 480 px covers 2× displays.
const LOGO_WIDTH = 480
const LOGO_HEIGHT = 75

// Explicit dimensions let the browser reserve the space before the image
// loads, so nothing shifts.
const Logo = ({ height = 36 }) => (
  <img
    src={logoUrl}
    alt={brand.logoAlt}
    width={Math.round((LOGO_WIDTH / LOGO_HEIGHT) * height)}
    height={height}
    className="logo"
    decoding="async"
  />
)

export default Logo
