// Stands in for lucide-react (the web's icons). Shared lib files (labFindings, homeInsights) attach an icon to what they
// return, for the web's rows; the app never draws them, so every icon is an empty component and the library stays out
// of the bundle.
const none = () => null
module.exports = new Proxy({ __esModule: true }, { get: (t, k) => (k in t ? t[k] : none) })
