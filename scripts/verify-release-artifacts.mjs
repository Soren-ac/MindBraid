import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { loadReleaseContract, repositoryFileUrl } from "./release-contract.mjs";

const artifactDirectory = readArtifactDirectory(process.argv.slice(2));
const contract = await loadReleaseContract();
const artifactRoot = resolve(process.cwd(), artifactDirectory);
const requiredArtifacts = ["main.js", "manifest.json", "styles.css"];

await Promise.all(
	requiredArtifacts.map(async (fileName) => {
		const artifactPath = resolve(artifactRoot, fileName);
		await assertNonEmptyFile(artifactPath, fileName);
	}),
);

const [releaseManifestText, rootManifestText, releaseStyles] = await Promise.all([
	readFile(resolve(artifactRoot, "manifest.json"), "utf8"),
	readFile(repositoryFileUrl("manifest.json"), "utf8"),
	readFile(resolve(artifactRoot, "styles.css"), "utf8"),
]);

let releaseManifest;
try {
	releaseManifest = JSON.parse(releaseManifestText);
} catch (error) {
	throw new Error("Release manifest.json is not valid JSON.", { cause: error });
}

if (releaseManifestText !== rootManifestText) {
	throw new Error("Release manifest.json must exactly match the repository manifest.json.");
}
if (
	typeof releaseManifest !== "object" ||
	releaseManifest === null ||
	releaseManifest.id !== contract.manifest.id ||
	releaseManifest.version !== contract.version ||
	releaseManifest.minAppVersion !== contract.minimumAppVersion
) {
	throw new Error(
		"Release manifest.json must retain the validated plugin id, version, and minimum Obsidian version.",
	);
}
if (!releaseStyles.includes(".obmind-")) {
	throw new Error("Release styles.css must contain the obmind CSS scope.");
}

process.stdout.write(
	`Release artifacts verified in ${artifactDirectory}: ${requiredArtifacts.join(", ")} ` +
		`for MindBraid ${contract.version}.\n`,
);

function readArtifactDirectory(argumentsList) {
	if (argumentsList.length === 0) {
		return ".";
	}
	if (argumentsList.length === 2 && argumentsList[0] === "--directory") {
		return argumentsList[1];
	}
	if (argumentsList.length === 1 && argumentsList[0].startsWith("--directory=")) {
		return argumentsList[0].slice("--directory=".length);
	}

	throw new Error(
		"Usage: node scripts/verify-release-artifacts.mjs [--directory path]",
	);
}

async function assertNonEmptyFile(filePath, label) {
	try {
		await access(filePath);
		const metadata = await stat(filePath);
		if (!metadata.isFile() || metadata.size === 0) {
			throw new Error(`${label} must be a non-empty regular file.`);
		}
	} catch (error) {
		if (error instanceof Error && error.message === `${label} must be a non-empty regular file.`) {
			throw error;
		}
		throw new Error(`Required release artifact ${label} is missing or unreadable.`, {
			cause: error,
		});
	}
}
