export function postgresAdapterConfig(databaseUrl: string): {
  connectionString: string;
  schema: string;
} {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error('DATABASE_URL contains an invalid PostgreSQL schema');
  }

  url.searchParams.delete('schema');
  return { connectionString: url.toString(), schema };
}
