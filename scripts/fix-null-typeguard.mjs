import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/app/api/jyinx/code-search/route.ts");
let content = fs.readFileSync(filePath, "utf8");

// Fix 1: Change catch block from returning `null` to `null as unknown as CodeSearchSource`
// This keeps the array type consistent while being filtered later
const target = `      } catch {
        return null;
      }`;

const replacement = `      } catch {
        return null as unknown as CodeSearchSource;
      }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Fixed: catch block now returns null cast as CodeSearchSource");
} else {
  console.log("Pattern not found - checking context");
  const idx = content.indexOf("return null;");
  if (idx >= 0) {
    const context = content.substring(Math.max(0, idx - 20), idx + 40);
    console.log("Context around return null:");
    console.log(JSON.stringify(context));
  }
}