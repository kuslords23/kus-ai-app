import fs from "fs";
const path = "src/app/api/jyinx/code-search/route.ts";
let content = fs.readFileSync(path, "utf8");

// Fix the duplicate "rs" key in langMap
const oldText = "py: \"python\", rs: \"rust\", go: \"go\", rs: \"rust\",";
const newText = "py: \"python\", rs: \"rust\", go: \"go\",";

if (content.includes(oldText)) {
  content = content.replace(oldText, newText);
  fs.writeFileSync(path, content, "utf8");
  console.log("Fixed duplicate rs key");
} else {
  console.log("Pattern not found");
  // Debug: find what's actually around that area
  const idx = content.indexOf("py: \"python\"");
  if (idx >= 0) {
    console.log("Found python at", idx);
    console.log("Context:", content.substring(idx, idx + 80));
  }
}