const fs = require("fs");
const path = require("path");
const PDFLib = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { wareki, rules } = require("../docs/lib/rules.js");
const fill = require("../docs/lib/fill.js");

const DOCS = path.join(__dirname, "..", "docs");
const sample = () => JSON.parse(fs.readFileSync(path.join(DOCS, "sample.json"), "utf8"));
const load = async (p) => new Uint8Array(fs.readFileSync(path.join(DOCS, p)));
const build = (data, images) => fill.build(data, images || {}, { PDFLib, fontkit, wareki, load });

module.exports = { PDFLib, wareki, rules, fill, sample, build, DOCS };
