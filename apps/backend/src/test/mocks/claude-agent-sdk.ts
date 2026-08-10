export async function* query() {
  yield* [];
  throw new Error('claude-agent-sdk query should be mocked by the test');
}
