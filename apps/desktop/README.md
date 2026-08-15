# LasmeX desktop

English | [中文](README.zh.md)

LasmeX desktop packages the Web interface with an embedded Host. It opens no HTTP server or public port: the isolated renderer loads `lasmex://app`, and Electron's main process forwards that scheme to the same client module graph, `HostConnectionService.fetch`, API Proxy, and host/mux streams used by the Web product. The desktop overlay replaces only Web startup, HMR, and directory picking; agent composition remains owned by the `web` profile.

## Local use

```powershell
pnpm install --frozen-lockfile
pnpm desktop:start
```

The renderer enables `contextIsolation`, Chromium sandboxing, and Web security, with Node integration and DevTools disabled. A private Electron session rejects permissions and remote requests; its CSP admits packaged resources plus in-memory `data:` images/fonts and same-origin `blob:` images/workers. The main frame cannot leave the packaged entry document, and new windows, webviews, redirects, and foreign origins are rejected. The custom scheme serves only Vite assets, exact revisions from the composed plugin graph, and same-origin `/api` requests.

## Distribution builds

```powershell
pnpm desktop:package
pnpm desktop:make:windows
pnpm desktop:make:macos
pnpm desktop:make:linux
```

Each target must run on its native operating system. `desktop:package` creates an unpacked bundle under `apps/desktop/out/LasmeX-<platform>-<arch>`. The make commands produce these artifacts:

- Windows: `apps/desktop/out/make/squirrel.windows/<arch>/LasmeX-Setup-<version>-<arch>.exe`, the update `.nupkg`, and `RELEASES`.
- macOS: `apps/desktop/out/make/LasmeX-<version>-darwin-<arch>.zip`, containing `LasmeX.app`.
- Linux: `apps/desktop/out/make/LasmeX-<version>-linux-<arch>.tar.gz`.

The native bundle is assembled from the pinned Electron distribution and the deployed production ASAR. Electron Packager is not in this path. Packaging materializes workspace links, rejects missing required peers, keeps native modules beside their DLLs and helpers in `app.asar.unpacked`, and restores the frozen development install before returning. Every make writes `out/make/manifest-<platform>-<arch>.json` with product/version metadata, signature state, sizes, and SHA-256 hashes.

The canonical LasmeX mark is stored as SVG plus PNG, ICO, and ICNS assets. Windows application and installer resources, the macOS bundle, and the Linux window/bundle use those assets. Application metadata takes its version from the shared release manifest and identifies `LasmeX contributors`; this descriptive publisher field is not a digital signature.

## Signed releases and updates

Unsigned builds are the default. Their embedded release metadata disables updates before any network request, and their manifests contain `"signed": false`.

Set `LASMEX_DESKTOP_RELEASE=1` only in a controlled release job. Windows and macOS release builds also require `LASMEX_DESKTOP_UPDATE_BASE_URL`, which must be an HTTPS URL without credentials, query, or fragment. The URL is normalized and sealed inside the ASAR. The main process configures Electron `autoUpdater` against `<base>/<platform>/<version>` only for an installed, packaged release. The Windows endpoint must expose the Squirrel `RELEASES` payload; the macOS endpoint must implement the Squirrel.Mac response. Linux uses the distribution's package/update channel because Electron has no built-in Linux updater.

Windows release signing requires:

- `WINDOWS_CERTIFICATE_FILE`: path to the Authenticode PFX.
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX password.

macOS release signing and notarization require `LASMEX_MACOS_SIGN_IDENTITY` plus exactly one notarization method:

- `LASMEX_MACOS_NOTARY_PROFILE`; or
- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.

Missing, partial, mixed, non-HTTPS, or unsupported configuration fails before staging or network access. The macOS lane signs with Electron's maintained signer, verifies the bundle, submits it with `xcrun notarytool`, staples and validates the ticket, then creates the final ZIP. No certificate, Apple credential, update origin, signature, or notarization result is included in this repository.

## Verification

```powershell
pnpm --filter lasmex-desktop test
pnpm --filter lasmex-desktop run build
pnpm --filter lasmex-desktop run smoke:artifact
```

The Windows artifact smoke refuses a machine with an existing LasmeX installation. It installs the generated Setup, checks version metadata and the Squirrel runtime, launches the installed application, waits for the `LasmeX` window and a renderer process, then uninstalls the test copy. Desktop user data and `$LASMEX_HOME` are redirected under the ignored `apps/desktop/out/smoke-windows` directory.

## Model Experience

The desktop application changes the carrier and window lifecycle only. Model requests, tools, prompts, session events, and plugin composition remain those of the selected LasmeX profile.

#### KV Cache effect

None. The desktop carrier does not alter provider requests or prompt ordering.

## Known limitations

- The checked-in configuration cannot produce a trusted public release without external Authenticode and Apple credentials plus a real HTTPS update service.
- The application uses the profile's credential-reference provider and `$LASMEX_HOME/.credentials.yaml`. It does not copy, reveal, or claim to encrypt an existing key with Electron `safeStorage`; migration needs an explicit credential-store design that preserves references and never exposes plaintext.
- Closing the single window shuts down the embedded profile. Multi-window and background-host lifecycles are not implemented.

## GUI recording after assembly

Record the real packaged flow after the assembled product and model configuration are available: install and launch LasmeX, create a session from the French home screen, submit a prompt, wait for the real streamed response, open the trajectory view, then close the window and confirm the process exits. The recording must use the packaged application and its real Host/model path rather than a fixture.
