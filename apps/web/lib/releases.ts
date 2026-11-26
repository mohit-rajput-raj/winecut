export type TargetOS = 'windows' | 'macos' | 'linux';

export interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: GitHubAsset[];
}

export interface OSReleaseDownloads {
  primary: GitHubAsset | null;
  secondary: GitHubAsset | null;
  all: GitHubAsset[];
}

export const GITHUB_LATEST_RELEASE_API =
  'https://api.github.com/repos/mohit-rajput-raj/winecut/releases/latest';
export const RELEASES_URL = 'https://github.com/mohit-rajput-raj/winecut/releases/latest';
export const REPO_URL = 'https://github.com/mohit-rajput-raj/winecut';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getPlatformLabel(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.exe')) return 'Windows Installer (.exe)';
  if (lower.endsWith('.msi')) return 'Windows Package (.msi)';
  if (lower.endsWith('.dmg')) return 'macOS Universal (.dmg)';
  if (lower.endsWith('.appimage')) return 'Linux Portable (.AppImage)';
  if (lower.endsWith('.deb')) return 'Linux Debian/Ubuntu (.deb)';
  if (lower.endsWith('.rpm')) return 'Linux Fedora/RHEL (.rpm)';
  return 'Installer Package';
}

export function filterInstallerAssets(assets: GitHubAsset[]): GitHubAsset[] {
  return assets.filter((asset) => {
    const lower = asset.name.toLowerCase();
    return (
      !lower.endsWith('.json') &&
      !lower.endsWith('.sig') &&
      !lower.endsWith('.tar.gz')
    );
  });
}

export function groupInstallerAssetsByOS(
  assets: GitHubAsset[],
): Record<TargetOS, OSReleaseDownloads> {
  const winAll = assets.filter((a) => {
    const l = a.name.toLowerCase();
    return l.endsWith('.exe') || l.endsWith('.msi');
  });
  const winExe = winAll.find((a) => a.name.toLowerCase().endsWith('.exe')) || null;
  const winMsi = winAll.find((a) => a.name.toLowerCase().endsWith('.msi')) || null;

  const macAll = assets.filter((a) => a.name.toLowerCase().endsWith('.dmg'));

  const linuxAll = assets.filter((a) => {
    const l = a.name.toLowerCase();
    return l.endsWith('.appimage') || l.endsWith('.deb') || l.endsWith('.rpm');
  });
  const linuxAppImage =
    linuxAll.find((a) => a.name.toLowerCase().endsWith('.appimage')) || null;
  const linuxDeb = linuxAll.find((a) => a.name.toLowerCase().endsWith('.deb')) || null;
  const linuxRpm = linuxAll.find((a) => a.name.toLowerCase().endsWith('.rpm')) || null;

  const winPrimary = winExe ?? winMsi ?? null;
  const winSecondary = winExe && winMsi ? winMsi : null;

  const linuxPrimary = linuxAppImage ?? linuxDeb ?? linuxRpm ?? null;
  const linuxSecondary =
    linuxPrimary && linuxDeb && linuxPrimary.id !== linuxDeb.id
      ? linuxDeb
      : linuxPrimary && linuxRpm && linuxPrimary.id !== linuxRpm.id
        ? linuxRpm
        : null;

  return {
    windows: { primary: winPrimary, secondary: winSecondary, all: winAll },
    macos: { primary: macAll[0] ?? null, secondary: macAll[1] ?? null, all: macAll },
    linux: { primary: linuxPrimary, secondary: linuxSecondary, all: linuxAll },
  };
}

export async function fetchLatestRelease(
  signal?: AbortSignal,
): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_API, {
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubRelease;
    if (!data || !Array.isArray(data.assets)) return null;
    return data;
  } catch {
    return null;
  }
}
