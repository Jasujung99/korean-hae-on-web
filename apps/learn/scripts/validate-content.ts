import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { firstTwelveReviewRows, stageTwoReviewRows } from "../content/catalog.ts";
import { validateCatalog } from "../content/validate.ts";
import { catalog } from "../content/catalog.ts";

const issues = validateCatalog(catalog, firstTwelveReviewRows());
if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.code} ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

const reviewPath = fileURLToPath(new URL("../content/review/first-12.json", import.meta.url));
const stageTwoPath = fileURLToPath(new URL("../content/review/stage-2-candidates.json", import.meta.url));
if (process.argv.includes("--write-review")) {
  writeFileSync(reviewPath, `${JSON.stringify(firstTwelveReviewRows(), null, 2)}\n`);
  writeFileSync(stageTwoPath, `${JSON.stringify(stageTwoReviewRows(), null, 2)}\n`);
}

console.log("content validation passed");
