/**
 * API Versioning Middleware
 *
 * Provides API versioning for future compatibility. Allows breaking changes
 * to be introduced without breaking existing clients through version
 * negotiation via headers, deprecation warnings, and version migration guides.
 *
 * @module lib/api/api-versioning
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Types
// ============================================================================

export interface ApiVersion {
  version: string;
  active: boolean;
  deprecated: boolean;
  sunsetDate?: string;
  deprecationMessage?: string;
  migrationGuide?: string;
  features: string[];
  releasedAt: string;
}

export interface VersionNegotiation {
  version: string;
  isLatest: boolean;
  isDeprecated: boolean;
  warnings: string[];
}

export interface VersionedRouteConfig {
  basePath: string;
  versions: ApiVersion[];
  defaultVersion: string;
  latestVersion: string;
}

// ============================================================================
// Version Registry
// ============================================================================

const VERSION_REGISTRY: ApiVersion[] = [
  {
    version: 'v1', active: true, deprecated: true, sunsetDate: '2026-12-31',
    deprecationMessage: 'API v1 is deprecated. Please migrate to v2.',
    migrationGuide: '/docs/api/v1-to-v2-migration',
    features: ['chat', 'personas', 'goals'], releasedAt: '2025-01-01',
  },
  {
    version: 'v2', active: true, deprecated: false,
    features: ['chat', 'personas', 'goals', 'streaming', 'batch'],
    releasedAt: '2025-06-01',
  },
];

export function getVersionRegistry(): ApiVersion[] { return [...VERSION_REGISTRY]; }
export function getVersion(version: string): ApiVersion | undefined { return VERSION_REGISTRY.find(v => v.version === version); }
export function getLatestVersion(): ApiVersion {
  return VERSION_REGISTRY.filter(v => v.active && !v.deprecated)
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0];
}
export function getDeprecatedVersions(): ApiVersion[] { return VERSION_REGISTRY.filter(v => v.deprecated); }

// ============================================================================
// Version Negotiation
// ============================================================================

export function negotiateVersion(request: NextRequest): VersionNegotiation {
  const latestVersion = getLatestVersion();
  const warnings: string[] = [];

  const acceptVersion = request.headers.get('Accept-Version');
  const apiVersion = request.headers.get('API-Version');
  const pathMatch = request.nextUrl.pathname.match(/^\/api\/(v\d+)/);
  const pathVersion = pathMatch ? pathMatch[1] : null;

  let requestedVersion = pathVersion || acceptVersion || apiVersion || latestVersion.version;
  if (!requestedVersion.startsWith('v')) requestedVersion = `v${requestedVersion}`;

  const version = getVersion(requestedVersion);
  if (!version) {
    warnings.push(`Unknown API version '${requestedVersion}'. Using latest version '${latestVersion.version}'.`);
    return { version: latestVersion.version, isLatest: true, isDeprecated: false, warnings };
  }

  if (version.deprecated) {
    warnings.push(version.deprecationMessage || `API version '${version.version}' is deprecated.`);
    if (version.sunsetDate) warnings.push(`This version will be sunset on ${version.sunsetDate}.`);
    if (version.migrationGuide) warnings.push(`Migration guide: ${version.migrationGuide}`);
  }

  return { version: version.version, isLatest: version.version === latestVersion.version, isDeprecated: version.deprecated, warnings };
}

export function createVersionMiddleware(config: VersionedRouteConfig) {
  return async (
    request: NextRequest,
    handler: (request: NextRequest, version: ApiVersion) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const negotiation = negotiateVersion(request);
    const version = getVersion(negotiation.version);
    if (!version) return NextResponse.json({ error: 'Invalid API version' }, { status: 400 });

    const response = await handler(request, version);
    response.headers.set('API-Version', negotiation.version);
    response.headers.set('API-Latest-Version', config.latestVersion);

    if (negotiation.isDeprecated && version.sunsetDate) {
      response.headers.set('Deprecation', `Sunset: ${version.sunsetDate}`);
      response.headers.set('Link', `<${version.migrationGuide || '/'}>; rel="deprecation"`);
    }
    for (const warning of negotiation.warnings) {
      response.headers.append('Warning', `299 - "${warning}"`);
    }
    return response;
  };
}

// ============================================================================
// Response Helpers
// ============================================================================

export function versionedResponse(
  data: unknown, version: ApiVersion, options?: { status?: number; warnings?: string[] }
): NextResponse {
  const response = NextResponse.json(data, { status: options?.status || 200 });
  response.headers.set('API-Version', version.version);
  const latest = getLatestVersion();
  response.headers.set('API-Latest-Version', latest.version);

  if (version.deprecated) {
    if (version.sunsetDate) response.headers.set('Deprecation', `Sunset: ${version.sunsetDate}`);
    if (version.migrationGuide) response.headers.set('Link', `<${version.migrationGuide}>; rel="deprecation"`);
  }
  if (options?.warnings) {
    for (const warning of options.warnings) response.headers.append('Warning', `299 - "${warning}"`);
  }

  const activeVersions = VERSION_REGISTRY.filter(v => v.active).map(v => v.version).join(', ');
  response.headers.set('API-Supported-Versions', activeVersions);
  return response;
}

export function deprecatedResponse(message: string, migrationGuide?: string): NextResponse {
  const response = NextResponse.json(
    { error: 'deprecated', message, migrationGuide, currentVersion: getLatestVersion().version },
    { status: 410 }
  );
  if (migrationGuide) response.headers.set('Link', `<${migrationGuide}>; rel="deprecation"`);
  return response;
}

export function versionMismatchResponse(requested: string, available: string[]): NextResponse {
  return NextResponse.json(
    { error: 'version_not_found', message: `API version '${requested}' is not available.`, availableVersions: available, latestVersion: getLatestVersion().version },
    { status: 404 }
  );
}

// ============================================================================
// Migration Utilities
// ============================================================================

export function migrateRequestBody(
  body: Record<string, unknown>, fromVersion: string, toVersion: string
): Record<string, unknown> {
  const migrations: Record<string, Record<string, (body: Record<string, unknown>) => Record<string, unknown>>> = {
    'v1->v2': {
      // Add field migrations here as versions evolve
    },
  };
  const versionMigrations = migrations[`${fromVersion}->${toVersion}`];
  if (!versionMigrations) return body;
  let migrated = { ...body };
  for (const [, transform] of Object.entries(versionMigrations)) migrated = transform(migrated);
  return migrated;
}

export function migrateResponseBody(
  body: Record<string, unknown>, fromVersion: string, toVersion: string
): Record<string, unknown> {
  const migrations: Record<string, Record<string, (body: Record<string, unknown>) => Record<string, unknown>>> = {
    'v1->v2': {},
  };
  const versionMigrations = migrations[`${fromVersion}->${toVersion}`];
  if (!versionMigrations) return body;
  let migrated = { ...body };
  for (const [, transform] of Object.entries(versionMigrations)) migrated = transform(migrated);
  return migrated;
}

// ============================================================================
// Convenience Exports
// ============================================================================

export function getVersionInfo(version: string): {
  version: ApiVersion | undefined; isLatest: boolean; isDeprecated: boolean; daysUntilSunset: number | null;
} {
  const versionInfo = getVersion(version);
  const latest = getLatestVersion();
  let daysUntilSunset: number | null = null;
  if (versionInfo?.sunsetDate) {
    daysUntilSunset = Math.ceil((new Date(versionInfo.sunsetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }
  return { version: versionInfo, isLatest: version === latest.version, isDeprecated: versionInfo?.deprecated || false, daysUntilSunset };
}

export function createVersionHeader(version: string): string {
  const info = getVersionInfo(version);
  return `version=${info.version}; status=${info.isLatest ? 'current' : 'legacy'}${info.isDeprecated ? '; deprecated' : ''}`;
}
