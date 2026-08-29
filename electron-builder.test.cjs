/* electron-builder test-build configuration.
 *
 * Same as electron-builder.cjs but emits a separate-name, separate-directory
 * packaged app (`cue-test`) so the production `dist/win-unpacked/cue.exe`
 * is not overwritten. Used by `npm run pack:win:test` to produce a runnable
 * test exe in `dist-test/win-unpacked/cue-test.exe`.
 *
 * Use this build ONLY for local testing — it is unsigned and the productName
 * makes it visually distinct (`cue-test`) so it can sit alongside the real
 * build without confusion.
 */
const base = require('./electron-builder.cjs');

module.exports = {
  ...base,
  productName: 'cue-test',
  directories: {
    ...(base.directories || {}),
    output: 'dist-test',
  },
};
