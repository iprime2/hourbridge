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
    target: ["dmg"],
    category: "public.app-category.productivity",
    identity: null,
  },
};
