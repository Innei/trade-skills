import { readFileSync, writeFileSync } from "node:fs";

// generate_appcast stamps every archive it processes with the current run's
// --download-url-prefix, so items regenerated from older zips (fetched into the
// archive dir only as delta bases) end up pointing at the new tag's release,
// where those assets were never uploaded (404). Enclosure URLs are not covered
// by the EdDSA signatures (those sign the file contents), so rewriting each URL
// back to the tag its own version was published under is safe.
const [appcastPath, repoSlug] = process.argv.slice(2);
if (!appcastPath || !repoSlug) {
  console.error("usage: fix-appcast-enclosure-urls.mjs <appcast.xml> <owner/repo>");
  process.exit(1);
}

const enclosureUrl = new RegExp(
  `url="https://github\\.com/${repoSlug.replace(/[/.]/g, "\\$&")}/releases/download/desktop-v[^/"]+/([^/"]+)"`,
  "g",
);

const xml = readFileSync(appcastPath, "utf8");
let rewrites = 0;
const fixed = xml.replace(enclosureUrl, (match, filename) => {
  const version = /\d+\.\d+\.\d+/.exec(filename)?.[0];
  if (!version) return match;
  const url = `url="https://github.com/${repoSlug}/releases/download/desktop-v${version}/${filename}"`;
  if (url !== match) {
    rewrites++;
    console.log(`repointed ${filename} -> desktop-v${version}`);
  }
  return url;
});

writeFileSync(appcastPath, fixed);
console.log(`${rewrites} enclosure URL(s) rewritten in ${appcastPath}`);
