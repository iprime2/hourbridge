import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const BUILD_ID_PLACEHOLDER = "'__BUILD_ID__'"
const PRECACHE_PLACEHOLDER = "['__PRECACHE__']"

/** Every file under `dir`, as POSIX paths relative to it, sorted so the result is deterministic. */
export function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(relative(dir, full).split(sep).join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

/** Files the worker must not cache: itself, and source maps (never needed by visitors). */
export function isPrecacheable(path: string): boolean {
  return path !== 'sw.js' && !path.endsWith('.map')
}

/**
 * A short id that changes whenever *any* served file's name or bytes change, so a redeploy always
 * gets a fresh cache — even when only an unhashed file (an icon, the manifest) was edited.
 */
export function computeBuildId(files: readonly { path: string; content: Buffer | string }[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 12)
}

/** Fill in the two placeholders; throws if the worker source doesn't have them (a silent no-op would ship a broken cache). */
export function injectIntoServiceWorker(
  source: string,
  { buildId, precache }: { buildId: string; precache: readonly string[] }
): string {
  if (!source.includes(BUILD_ID_PLACEHOLDER) || !source.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error('sw.js is missing its __BUILD_ID__ / __PRECACHE__ placeholders')
  }
  return source
    .replace(BUILD_ID_PLACEHOLDER, JSON.stringify(buildId))
    .replace(PRECACHE_PLACEHOLDER, JSON.stringify(precache))
}

/**
 * Post-build step: list the emitted site, hash it, and stamp the result into dist's sw.js.
 * "./" is included so the app shell is available offline as a navigation fallback.
 */
export function finalizeServiceWorker(outDir: string): { buildId: string; precache: string[] } {
  const files = listFiles(outDir).filter(isPrecacheable)
  const buildId = computeBuildId(
    files.map((path) => ({ path, content: readFileSync(join(outDir, path)) }))
  )
  const precache = ['./', ...files]
  const swPath = join(outDir, 'sw.js')
  writeFileSync(swPath, injectIntoServiceWorker(readFileSync(swPath, 'utf8'), { buildId, precache }))
  return { buildId, precache }
}
