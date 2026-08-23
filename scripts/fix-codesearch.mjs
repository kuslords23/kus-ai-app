import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/api/jyinx/code-search/route.ts");
let content = fs.readFileSync(filePath, "utf8");

// The duplicate is: go: "go", rs: "rust",
// followed by newline + indentation + rs: "rust",
const q = String.fromCharCode(34);
const firstRs = `go: ${q}go${q}, rs: ${q}rust${q},`;
const secondRs = `rs: ${q}rust${q},`;

const idx = content.indexOf(firstRs);
if (idx >= 0) {
  const afterFirst = content.substring(idx + firstRs.length);
  const secondIdx = afterFirst.indexOf(secondRs);
  if (secondIdx >= 0) {
    const before = content.substring(0, idx + firstRs.length);
    const after = content.substring(idx + firstRs.length + secondIdx + secondRs.length);
    const fixed = before + after;
  fs.writeFileSync(filePath, fixed, "utf8");
  console.log("Fixed duplicate rs key in langMap");
} else {
    console.log("Could not find second rs:rust instance");
}
} else {
  console.log("Could not find pattern starting with go:go, rs:rust");
}

