import { ConfigurationHandler } from "@ubiquity-os/plugin-sdk/configuration";

type GitHubPlugin = Exclude<Parameters<ConfigurationHandler["getManifest"]>[0], string>;

export function getRefCandidates(ref?: string): (string | undefined)[] {
  if (!ref) {
    return [undefined];
  }

  if (ref.startsWith("dist/")) {
    return [ref];
  }

  return [`dist/${ref}`, ref];
}

export class BranchAwareConfigurationHandler extends ConfigurationHandler {
  override async getManifest(plugin: GitHubPlugin) {
    for (const ref of getRefCandidates(plugin.ref)) {
      const manifest = await super.getManifest({
        ...plugin,
        ref,
      });

      if (manifest) {
        return manifest;
      }
    }

    return null;
  }
}
