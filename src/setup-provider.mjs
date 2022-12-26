import AggregationProvider from "aggregation-repository-provider";
import { ETagCacheLevelDB } from "etag-cache-leveldb";
import levelup from "levelup";
import leveldown from "leveldown";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

async function createCache() {
  const dir = join(homedir(), ".cache/repository-provider");
  await mkdir(dir, { recursive: true });
  const db = await levelup(leveldown(dir));
  return new ETagCacheLevelDB(db);
}

export async function initializeRepositoryProvider(program, properties) {
  const provider = await AggregationProvider.initialize(
    [],
    properties,
    process.env
  );

  const options = program.opts();

  provider.messageDestination = {
    ...console,
    trace: options.trace ? console.log : () => {}
  };

  let cache;
  if (options.cache) {
    cache = await createCache();
    provider._providers.forEach(p => (p.cache = cache));
  }

  return { provider, options, cache };
}
