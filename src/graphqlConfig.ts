import { GraphQLConfig, loadConfig, loadConfigSync } from "graphql-config";
import { RelayDirectivesExtension } from "./configUtils";

const makeLoadConfig = (workspaceBaseDir: string) => ({
  configName: "relay",
  extensions: [RelayDirectivesExtension],
  rootDir: workspaceBaseDir,
});

export async function createGraphQLConfig(
  workspaceBaseDir: string
): Promise<GraphQLConfig | undefined> {
  const config = await loadConfig(makeLoadConfig(workspaceBaseDir));

  if (!config) {
    return;
  }

  return config;
}

export function createGraphQLConfigSync(
  workspaceBaseDir: string
): GraphQLConfig | undefined {
  const config = loadConfigSync(makeLoadConfig(workspaceBaseDir));

  if (!config) {
    return;
  }

  return config;
}
