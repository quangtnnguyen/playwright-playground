/**
 * Playwright global teardown — runs once after all tests complete (pass or fail).
 *
 * Responsibilities:
 *  1. Reads the NDJSON resource tracker populated during the test run.
 *  2. Prints a formatted summary table of every created resource to stdout.
 *  3. Writes (or updates) a dated MongoDB cleanup script for each spec.
 *
 * Script file convention:
 *   db-cleanup-scripts/mm-dd-yyyy-{spec}.js   ← the runnable mongosh script
 *   db-cleanup-scripts/mm-dd-yyyy-{spec}.json ← state file (enables merging on update)
 *
 * If a script already exists for the same date + spec, the new resource IDs
 * are merged in (duplicate IDs are silently ignored) and the script is
 * regenerated from the full merged list.
 *
 * MongoDB collection map (from Standard.Proxy.Core entities):
 *   provider      → providers      (standalone collection)
 *   integrator    → integrators    (standalone collection)
 *   api-config    → apis           (ApiVersions + ProviderApiEndpoints are embedded subdocs)
 *   mapper-config → mapperConfigs  (standalone collection)
 */

import * as fs from 'fs'
import * as path from 'path'
import {
    getTrackedResources,
    clearTracker,
    TrackedResource,
    ResourceType,
} from './utils/resource-tracker'

// ---------------------------------------------------------------------------
// Helpers — formatting
// ---------------------------------------------------------------------------

/** Returns a zero-padded "mm-dd-yyyy" date string. */
function toDateString(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mm}-${dd}-${d.getFullYear()}`
}

/** Filters resources by type. */
function byType(
    resources: TrackedResource[],
    type: ResourceType
): TrackedResource[] {
    return resources.filter((r) => r.type === type)
}

/** Formats a list of resources as a comma-separated ObjectId(...) list for the script. */
function toObjectIdList(resources: TrackedResource[]): string {
    return resources.map((r) => `    ObjectId('${r.id}')`).join(',\n')
}

// ---------------------------------------------------------------------------
// Script generation
// ---------------------------------------------------------------------------

function generateScript(
    resources: TrackedResource[],
    spec: string,
    updatedAt: string
): string {
    const providers = byType(resources, 'provider')
    const integrators = byType(resources, 'integrator')
    const apiConfigs = byType(resources, 'api-config')
    const mapperConfigs = byType(resources, 'mapper-config')
    const transformers = byType(resources, 'transformer')

    const lines: string[] = [
        `// MongoDB cleanup script`,
        `// Spec    : ${spec}`,
        `// Updated : ${updatedAt}`,
        `// Total   : ${resources.length} resource(s)`,
        `//`,
        `// ─── Setup ───────────────────────────────────────────────────────────────────`,
        `//`,
        `// 1. Set COLLECTION_PREFIX to match your target environment:`,
        `//      ''       → no prefix  (local dev, default)`,
        `//      'dev-'   → dev environment`,
        `//      'uat-'   → UAT environment`,
        `//`,
        `// 2. Run with mongosh:`,
        `//      mongosh "<connection-string>" --file db-cleanup-scripts/${toDateString(new Date())}-${spec}.js`,
        `//    Or paste directly into MongoDB Compass > Open shell.`,
        `//`,
        `// ─────────────────────────────────────────────────────────────────────────────`,
        ``,
        `const COLLECTION_PREFIX = ''  // ← change this before running`,
        ``,
        `// ─── Created resources ────────────────────────────────────────────────────────`,
        `//`,
        `//  Providers (${providers.length})`,
    ]

    for (const r of providers) {
        lines.push(`//    id=${r.id}  "${r.description}"`)
        lines.push(`//    created=${r.createdAt}`)
    }

    lines.push(`//`)
    lines.push(`//  Integrators (${integrators.length})`)
    for (const r of integrators) {
        lines.push(`//    id=${r.id}  "${r.description}"`)
        lines.push(`//    created=${r.createdAt}`)
    }

    lines.push(`//`)
    lines.push(
        `//  Api Configs — also removes embedded ApiVersions + ProviderApiEndpoints (${apiConfigs.length})`
    )
    for (const r of apiConfigs) {
        lines.push(`//    id=${r.id}  "${r.description}"`)
        lines.push(`//    created=${r.createdAt}`)
    }

    lines.push(`//`)
    lines.push(`//  Mapper Configs (${mapperConfigs.length})`)
    for (const r of mapperConfigs) {
        lines.push(`//    id=${r.id}  "${r.description}"`)
        lines.push(`//    created=${r.createdAt}`)
    }

    lines.push(`//`)
    lines.push(`//  Transformers (${transformers.length})`)
    for (const r of transformers) {
        lines.push(`//    id=${r.id}  "${r.description}"`)
        lines.push(`//    created=${r.createdAt}`)
    }

    lines.push(``)
    lines.push(
        `// ─── Cleanup queries ─────────────────────────────────────────────────────────`
    )

    if (providers.length > 0) {
        lines.push(``)
        lines.push(`// Providers`)
        lines.push(
            `db.getCollection(COLLECTION_PREFIX + 'providers').deleteMany({`
        )
        lines.push(`    _id: {`)
        lines.push(`        $in: [`)
        lines.push(toObjectIdList(providers))
        lines.push(`        ],`)
        lines.push(`    },`)
        lines.push(`})`)
    }

    if (integrators.length > 0) {
        lines.push(``)
        lines.push(`// Integrators`)
        lines.push(
            `db.getCollection(COLLECTION_PREFIX + 'integrators').deleteMany({`
        )
        lines.push(`    _id: {`)
        lines.push(`        $in: [`)
        lines.push(toObjectIdList(integrators))
        lines.push(`        ],`)
        lines.push(`    },`)
        lines.push(`})`)
    }

    if (mapperConfigs.length > 0) {
        lines.push(``)
        lines.push(
            `// Mapper configs (delete before api-configs so the references go away first)`
        )
        lines.push(
            `db.getCollection(COLLECTION_PREFIX + 'mapperConfigs').deleteMany({`
        )
        lines.push(`    _id: {`)
        lines.push(`        $in: [`)
        lines.push(toObjectIdList(mapperConfigs))
        lines.push(`        ],`)
        lines.push(`    },`)
        lines.push(`})`)
    }

    if (apiConfigs.length > 0) {
        lines.push(``)
        lines.push(
            `// Api configs (deleting the parent document also removes all embedded`
        )
        lines.push(`// ApiVersions and ProviderApiEndpoints stored inside it)`)
        lines.push(`db.getCollection(COLLECTION_PREFIX + 'apis').deleteMany({`)
        lines.push(`    _id: {`)
        lines.push(`        $in: [`)
        lines.push(toObjectIdList(apiConfigs))
        lines.push(`        ],`)
        lines.push(`    },`)
        lines.push(`})`)
    }

    if (transformers.length > 0) {
        lines.push(``)
        lines.push(`// Transformers (fis-common-transformer collection)`)
        lines.push(
            `db.getCollection(COLLECTION_PREFIX + 'transformers').deleteMany({`
        )
        lines.push(`    _id: {`)
        lines.push(`        $in: [`)
        lines.push(toObjectIdList(transformers))
        lines.push(`        ],`)
        lines.push(`    },`)
        lines.push(`})`)
    }

    return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

function printSummary(resources: TrackedResource[]): void {
    const COL = 64
    const bar = '─'.repeat(COL)

    const title = `  Test Run — Created Resources (${resources.length} total)`
    console.log(`\n┌${bar}┐`)
    console.log(`│${title.padEnd(COL)}│`)
    console.log(`├${bar}┤`)

    // Group by type for a cleaner printout
    for (const type of [
        'provider',
        'integrator',
        'api-config',
        'mapper-config',
        'transformer',
    ] as const) {
        const items = byType(resources, type)
        if (items.length === 0) continue
        const typeLabel = `  ── ${type} (${items.length}) ──`
        console.log(`│${typeLabel.padEnd(COL)}│`)
        for (const r of items) {
            const line = `    ${r.id}  ${r.description}`
            const truncated =
                line.length > COL
                    ? line.slice(0, COL - 1) + '…'
                    : line.padEnd(COL)
            console.log(`│${truncated}│`)
        }
    }

    console.log(`└${bar}┘\n`)
}

// ---------------------------------------------------------------------------
// Global teardown entry point
// ---------------------------------------------------------------------------

export default async function globalTeardown(): Promise<void> {
    const newResources = getTrackedResources()

    if (newResources.length === 0) {
        console.log(
            '\n[cleanup-tracker] No resources tracked this run — skipping script generation.\n'
        )
        clearTracker()
        return
    }

    printSummary(newResources)

    // Ensure output folder exists
    const cleanupDir = path.resolve(__dirname, 'db-cleanup-scripts')
    if (!fs.existsSync(cleanupDir)) {
        fs.mkdirSync(cleanupDir, { recursive: true })
    }

    // Group new resources by spec name
    const bySpec = new Map<string, TrackedResource[]>()
    for (const r of newResources) {
        if (!bySpec.has(r.spec)) bySpec.set(r.spec, [])
        bySpec.get(r.spec)!.push(r)
    }

    const today = toDateString(new Date())

    for (const [spec, specNew] of bySpec) {
        const baseName = `${today}-${spec}`
        const stateFile = path.join(cleanupDir, `${baseName}.json`)
        const jsFile = path.join(cleanupDir, `${baseName}.js`)
        const isUpdate = fs.existsSync(jsFile)

        // Load + merge existing state (dedup by ID so re-runs don't add duplicates)
        let existing: TrackedResource[] = []
        if (fs.existsSync(stateFile)) {
            try {
                existing = JSON.parse(
                    fs.readFileSync(stateFile, 'utf-8')
                ) as TrackedResource[]
            } catch {
                existing = []
            }
        }

        const seenIds = new Set(existing.map((r) => r.id))
        const merged = [...existing]
        for (const r of specNew) {
            if (!seenIds.has(r.id)) {
                merged.push(r)
                seenIds.add(r.id)
            }
        }

        const updatedAt = new Date().toISOString()
        fs.writeFileSync(stateFile, JSON.stringify(merged, null, 2), 'utf-8')
        fs.writeFileSync(
            jsFile,
            generateScript(merged, spec, updatedAt),
            'utf-8'
        )

        const action = isUpdate ? 'Updated' : 'Created'
        console.log(
            `[cleanup-tracker] ${action} → db-cleanup-scripts/${baseName}.js` +
                `  (${merged.length} resource(s)${isUpdate ? `, ${specNew.length} new` : ''})`
        )
    }

    console.log()
    clearTracker()
}
