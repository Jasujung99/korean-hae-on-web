import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { firstTwelveReviewRows, stageTwoReviewRows } from "../content/catalog.ts";
import { validateCatalog } from "../content/validate.ts";
import { catalog } from "../content/catalog.ts";
import { DICT_FILE, dictTargets, validateDictFile } from "../content/dict.ts";

const issues = validateCatalog(catalog, firstTwelveReviewRows());
if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.code} ${issue.path}: ${issue.message}`);
  }
  process.exit(1);
}

// 사전 풀이 자료(content/dict/entries.json): 단어표 낱말마다 항목이 있고 모양이 맞는지.
const dictIssues = validateDictFile(DICT_FILE, dictTargets().map((row) => row.id));
if (dictIssues.length > 0) {
  for (const issue of dictIssues) console.error(`dict ${issue.path}: ${issue.message}`);
  process.exit(1);
}

const reviewPath = fileURLToPath(new URL("../content/review/first-12.json", import.meta.url));
const stageTwoPath = fileURLToPath(new URL("../content/review/stage-2-candidates.json", import.meta.url));
if (process.argv.includes("--write-review")) {
  writeFileSync(reviewPath, `${JSON.stringify(firstTwelveReviewRows(), null, 2)}\n`);
  writeFileSync(stageTwoPath, `${JSON.stringify(stageTwoReviewRows(), null, 2)}\n`);
}

console.log("content validation passed");
