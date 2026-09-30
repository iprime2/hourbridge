/**
 * Regenerates every brand raster from the single mark definition in scripts/lib/brand.mjs:
 *
 *   build/icon.png                                      desktop icon (Windows/Linux/electron-builder default)
 *   build/icon-mac.png                                  macOS icon with the system margin
 *   build/appx/*.png                                    Microsoft Store tiles
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/     App Store icon (1024, no alpha)
 *   ios/App/App/Assets.xcassets/Splash.imageset/        launch images, light + dark
 *
 * Run: npm run generate:icons     (no dependencies; safe to re-run)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { desktopIcon, iosIcon, macIcon, splash, storeTile } from './lib/brand.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const at = (...p) => path.join(root, ...p)

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
  console.log(`wrote ${path.relative(root, file)} (${(data.length / 1024).toFixed(0)} kB)`)
}

write(at('build/icon.png'), desktopIcon())
write(at('build/icon-mac.png'), macIcon())

for (const [name, [w, h]] of Object.entries({
  'StoreLogo.png': [50, 50],
  'Square44x44Logo.png': [44, 44],
  'Square150x150Logo.png': [150, 150],
  'Wide310x150Logo.png': [310, 150]
})) {
  write(at('build/appx', name), storeTile(w, h))
}

const assets = at('ios/App/App/Assets.xcassets')
if (fs.existsSync(assets)) {
  write(path.join(assets, 'AppIcon.appiconset/AppIcon-512@2x.png'), iosIcon())

  const splashDir = path.join(assets, 'Splash.imageset')
  // Replace Capacitor's three identical placeholder files with one light and one dark image.
  for (const old of fs.readdirSync(splashDir)) {
    if (old.endsWith('.png')) fs.unlinkSync(path.join(splashDir, old))
  }
  write(path.join(splashDir, 'splash-light.png'), splash(false))
  write(path.join(splashDir, 'splash-dark.png'), splash(true))

  const entry = (filename, scale, dark) => ({
    idiom: 'universal',
    filename,
    scale,
    ...(dark ? { appearances: [{ appearance: 'luminosity', value: 'dark' }] } : {})
  })
  const images = ['1x', '2x', '3x'].flatMap((scale) => [
    entry('splash-light.png', scale, false),
    entry('splash-dark.png', scale, true)
  ])
  write(
    path.join(splashDir, 'Contents.json'),
    Buffer.from(JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n')
  )
} else {
  console.log('ios/ not found — skipped iOS assets (run `npm run ios:add` first)')
}
