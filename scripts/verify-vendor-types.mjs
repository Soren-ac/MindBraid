import { readFile } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const vendorTypeRoot = "src/tests/vendor-types/";
const metadataPath = `${vendorTypeRoot}metadata.json`;
const metadataUrl = new URL(metadataPath, repositoryRoot);
const metadata = await readJson(metadataUrl, metadataPath);

if (!isVendorTypeMetadata(metadata)) {
	throw new Error(
		`${metadataPath} must define string obsidianVersion, ` +
			"fflateVersion, and pdfLibVersion fields.",
	);
}

const packageContracts = [
	{
		packageName: "obsidian",
		metadataVersion: metadata.obsidianVersion,
		metadataKey: "obsidianVersion",
	},
	{
		packageName: "fflate",
		metadataVersion: metadata.fflateVersion,
		metadataKey: "fflateVersion",
	},
	{
		packageName: "pdf-lib",
		metadataVersion: metadata.pdfLibVersion,
		metadataKey: "pdfLibVersion",
	},
];

for (const contract of packageContracts) {
	await verifyInstalledPackageVersion(contract);
}

const [snapshot, installed] = await Promise.all([
	readBinaryFile(
		new URL(`${vendorTypeRoot}obsidian.d.ts`, repositoryRoot),
		`${vendorTypeRoot}obsidian.d.ts`,
	),
	readBinaryFile(
		new URL("node_modules/obsidian/obsidian.d.ts", repositoryRoot),
		"node_modules/obsidian/obsidian.d.ts",
	),
]);
if (!snapshot.equals(installed)) {
	throw new Error(
		`${vendorTypeRoot}obsidian.d.ts differs from the installed Obsidian API ` +
			"declaration. Refresh the snapshot before committing.",
	);
}

await verifyRuntimeExports();

async function verifyInstalledPackageVersion(contract) {
	const packageMetadataPath = `node_modules/${contract.packageName}/package.json`;
	const packageMetadata = await readJson(
		new URL(packageMetadataPath, repositoryRoot),
		packageMetadataPath,
	);
	if (!isPackageMetadata(packageMetadata)) {
		throw new Error(
			`${packageMetadataPath} does not contain a valid string version. ` +
				"Run npm install to restore the package.",
		);
	}
	if (packageMetadata.version !== contract.metadataVersion) {
		throw new Error(
			`${contract.packageName} version ${packageMetadata.version} does not match ` +
				`${metadataPath} ${contract.metadataKey} ` +
				`(${contract.metadataVersion}). Update the dependency contract before committing.`,
		);
	}
}

async function verifyRuntimeExports() {
	const [fflate, pdfLib] = await Promise.all([
		importFflateModule(),
		importPdfLibModule(),
	]);

	assertFunctionExport(fflate, "fflate", "inflateSync");
	assertFunctionExport(fflate, "fflate", "strToU8");
	assertFunctionExport(fflate, "fflate", "zipSync");

	if (typeof pdfLib.PDFDocument?.create !== "function") {
		throw new Error(
			"Runtime contract mismatch: pdf-lib must export PDFDocument.create as a function.",
		);
	}
}

async function importFflateModule() {
	try {
		return await import("fflate");
	} catch (error) {
		throw new Error(
			"Cannot import fflate while verifying vendor types. " +
				"Run npm install to restore the package.",
			{ cause: error },
		);
	}
}

async function importPdfLibModule() {
	try {
		return await import("pdf-lib");
	} catch (error) {
		throw new Error(
			"Cannot import pdf-lib while verifying vendor types. " +
				"Run npm install to restore the package.",
			{ cause: error },
		);
	}
}

function assertFunctionExport(module, packageName, exportName) {
	if (typeof module[exportName] !== "function") {
		throw new Error(
			`Runtime contract mismatch: ${packageName} must export ${exportName} as a function.`,
		);
	}
}

async function readJson(url, label) {
	let text;
	try {
		text = await readFile(url, "utf8");
	} catch (error) {
		throw new Error(
			`Cannot read ${label}. Run npm install or restore the repository file.`,
			{ cause: error },
		);
	}

	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`Cannot parse ${label} as JSON.`, { cause: error });
	}
}

async function readBinaryFile(url, label) {
	try {
		return await readFile(url);
	} catch (error) {
		throw new Error(
			`Cannot read ${label}. Run npm install or restore the repository file.`,
			{ cause: error },
		);
	}
}

function isVendorTypeMetadata(value) {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof value.obsidianVersion === "string" &&
		typeof value.fflateVersion === "string" &&
		typeof value.pdfLibVersion === "string"
	);
}

function isPackageMetadata(value) {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof value.version === "string"
	);
}
