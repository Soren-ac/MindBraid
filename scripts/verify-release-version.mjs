import { assertReleaseTag, loadReleaseContract } from "./release-contract.mjs";

const tag = readOptionalTag(process.argv.slice(2));
const contract = await loadReleaseContract();

if (tag !== undefined) {
	assertReleaseTag(tag, contract.version);
}

process.stdout.write(
	`Release version contract verified: ${contract.version} (Obsidian >= ${contract.minimumAppVersion}).\n`,
);

function readOptionalTag(argumentsList) {
	if (argumentsList.length === 0) {
		return undefined;
	}
	if (argumentsList.length === 2 && argumentsList[0] === "--tag") {
		return argumentsList[1];
	}
	if (argumentsList.length === 1 && argumentsList[0].startsWith("--tag=")) {
		return argumentsList[0].slice("--tag=".length);
	}

	throw new Error("Usage: node scripts/verify-release-version.mjs [--tag x.y.z]");
}
