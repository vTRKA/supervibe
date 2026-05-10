const actualNodeVersion = process.version;

// Knip 6.12 uses oxc-parser's experimental raw transfer mode when
// rawTransferSupported() returns true. On Windows this mode reserves a 6 GiB
// ArrayBuffer and can fail before Knip starts analyzing project files. There is
// no public oxc env flag for this, so the lint subprocess opts into the normal
// parser path by making raw-transfer runtime detection see a pre-v22 Node.
if (process.platform === "win32" && /^v2[2-9]\./.test(actualNodeVersion)) {
  Object.defineProperty(process, "version", {
    value: "v21.99.0",
    enumerable: true,
    configurable: true,
  });
  process.env.SUPERVIBE_KNIP_RAW_TRANSFER_DISABLED_FOR = actualNodeVersion;
}
