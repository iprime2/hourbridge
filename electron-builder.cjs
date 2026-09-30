/**
 * electron-builder configuration (electron-builder 26.x).
 *
 * Windows Store (AppX) identity fields are overridable via env vars so Partner
 * Center values are never committed. Placeholders work for local/CI artifact
 * builds; replace them before Store submission.
 *
 * Env vars:
 *   WIN_STORE_IDENTITY_NAME           Package/Identity/Name
 *   WIN_STORE_PUBLISHER               Package/Identity/Publisher (CN=...)
 *   WIN_STORE_PUBLISHER_DISPLAY_NAME  Properties.PublisherDisplayName
 *   WIN_STORE_APPLICATION_ID          Application Id (optional)
 *   WIN_STORE_DISPLAY_NAME            Properties.DisplayName (optional)
 *
 * Note: app-builder-lib 26.15.3 ships AppX (`appx`), not a dedicated MSIX
 * target. Microsoft Store accepts AppX and re-signs on submission.
 */

const identityName =
  process.env.WIN_STORE_IDENTITY_NAME || "YourPublisher.WorldTimeBuddy";
const publisher = process.env.WIN_STORE_PUBLISHER || "CN=ms";
const publisherDisplayName =
  process.env.WIN_STORE_PUBLISHER_DISPLAY_NAME || "Your Publisher";
const applicationId =
  process.env.WIN_STORE_APPLICATION_ID || identityName;
const displayName =
  process.env.WIN_STORE_DISPLAY_NAME || "World Time Buddy";

// macOS signing is opt-in: set CSC_LINK (base64 .p12 or path) + CSC_KEY_PASSWORD, or CSC_NAME
// for a keychain identity. Notarization additionally needs APPLE_TEAM_ID and Apple credentials.
// See README → "macOS signing & notarization".
const macSigning = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const macNotarize = macSigning && Boolean(process.env.APPLE_TEAM_ID);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.worldtimebuddy.app",
  productName: "World Time Buddy",
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: ["out/**/*"],
  artifactName: "WorldTimeBuddy-${version}-${os}-${arch}.${ext}",
  win: {
    // Default Windows targets for GitHub Releases (Setup.exe + portable).
    // Store AppX is built separately via `npm run dist:win:store`.
    target: ["nsis", "portable"],
  },
  nsis: {
    artifactName: "WorldTimeBuddy-${version}-win-${arch}-Setup.${ext}",
  },
  portable: {
    artifactName: "WorldTimeBuddy-${version}-win-${arch}-portable.${ext}",
  },
  appx: {
    identityName,
    publisher,
    publisherDisplayName,
    applicationId,
    displayName,
    // Electron requires runFullTrust; electron-builder adds it if omitted.
    capabilities: ["runFullTrust"],
    artifactName: "WorldTimeBuddy-${version}-win-store.${ext}",
  },
  mac: {
    // dmg for people, zip for auto-updaters and Homebrew casks.
    target: ["dmg", "zip"],
    category: "public.app-category.productivity",
    // Inset icon that matches the macOS icon grid (build/icon.png is used elsewhere).
    icon: "build/icon-mac.png",
    // Hardened runtime is required for notarization, and only meaningful when signing.
    hardenedRuntime: macSigning,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    // Uses APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or the APPLE_API_KEY trio).
    notarize: macNotarize,
    // No certificate configured → ship an unsigned build instead of failing.
    ...(macSigning ? {} : { identity: null }),
    extendInfo: {
      LSMinimumSystemVersion: "12.0",
    },
  },
};
